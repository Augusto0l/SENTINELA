"""Decode a bounded, text-preserving PCDF workbook before invoking the CSV pipeline."""
import base64
import csv
import io
import json
from pathlib import Path
import re
import sys
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZIP_DEFLATED, ZIP_STORED, ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pcdf-sandbox"))
from pipeline import HEADERS, MAX_BYTES, MAX_CELL, InvalidFile
from workspace import prepare_synthetic

MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PACKAGE = "{http://schemas.openxmlformats.org/package/2006/relationships}"
CELL = re.compile(r"([A-Z]{1,2})([1-9][0-9]{0,5})")
ESCAPE = re.compile(r"_x([0-9a-fA-F]{4})_")
NUMERIC = {"latitude", "longitude", "linha_xml"}


def read_xml(archive, name):
    with archive.open(name) as part:
        data = part.read(32 * 1024 * 1024 + 1)
    if len(data) > 32 * 1024 * 1024:
        raise InvalidFile("parte_xlsx_excede_limite")
    decoded = data.decode("utf-8-sig")
    if "<!DOCTYPE" in decoded or "<!ENTITY" in decoded:
        raise InvalidFile("declaracao_xml_xlsx_recusada")
    return ET.fromstring(decoded)


def text_value(container):
    if container is None:
        return ""
    return "".join(node.text or "" for node in container.findall(MAIN + "t")
                   + container.findall(MAIN + "r/" + MAIN + "t"))


def sheet_path(archive):
    workbook = read_xml(archive, "xl/workbook.xml")
    sheets = workbook.findall(MAIN + "sheets/" + MAIN + "sheet")
    if len(sheets) != 1 or sheets[0].get("state", "visible") != "visible":
        raise InvalidFile("xlsx_exige_uma_aba_visivel")
    key = sheets[0].get(REL + "id")
    links = read_xml(archive, "xl/_rels/workbook.xml.rels")
    matches = [link for link in links.findall(PACKAGE + "Relationship") if link.get("Id") == key]
    if not key or len(matches) != 1:
        raise InvalidFile("referencia_aba_invalida")
    link = matches[0]
    target = link.get("Target", "")
    path = target.lstrip("/") if target.startswith("/") else "xl/" + target
    if (link.get("TargetMode", "Internal") != "Internal" or link.get("Type") != REL[1:-1] + "/worksheet"
            or not re.fullmatch(r"xl/worksheets/sheet[0-9]+\.xml", path)):
        raise InvalidFile("referencia_aba_invalida")
    return path


def cell_text(cell, strings, col, row):
    kind = cell.get("t", "n")
    node = cell.find(MAIN + "v")
    value = (node.text or "") if node is not None else ""
    error = f"linha_{row}_coluna_{col + 1}"
    if cell.find(MAIN + "f") is not None:
        raise InvalidFile(error + "_formula_recusada")
    if kind == "inlineStr":
        value = text_value(cell.find(MAIN + "is"))
    elif kind == "s" and re.fullmatch(r"[0-9]{1,7}", value) and int(value) < len(strings):
        value = strings[int(value)]
    elif kind == "n" and (not value or (row > 1 and HEADERS[col] in NUMERIC
                                       and re.fullmatch(r"-?[0-9]+(?:\.[0-9]+)?", value))):
        pass
    elif kind != "str":
        raise InvalidFile(error + "_use_texto")
    value = ESCAPE.sub(lambda match: chr(int(match[1], 16)), value)
    value = value.encode("utf-16-le", "surrogatepass").decode("utf-16-le")
    if len(value) > MAX_CELL or "\0" in value:
        raise InvalidFile(error + "_texto_invalido")
    return value


def to_csv(content):
    if not 0 < len(content) <= MAX_BYTES:
        raise InvalidFile("tamanho_xlsx_invalido")
    with ZipFile(io.BytesIO(content)) as archive:
        entries = archive.infolist()
        names = {part.filename for part in entries}
        if (len(entries) > 256 or len(entries) != len(names)
                or sum(part.file_size for part in entries) > 64 * 1024 * 1024
                or any(part.flag_bits & 1 or part.compress_type not in {ZIP_STORED, ZIP_DEFLATED}
                       for part in entries)):
            raise InvalidFile("limites_arquivo_xlsx")
        table = read_xml(archive, sheet_path(archive)).find(MAIN + "sheetData")
        if table is None:
            raise InvalidFile("aba_sem_dados")
        strings = []
        if "xl/sharedStrings.xml" in names:
            dictionary = read_xml(archive, "xl/sharedStrings.xml")
            strings = [text_value(cell) for cell in dictionary.findall(MAIN + "si")]
        result = io.BytesIO()
        line = io.StringIO(newline="")
        writer = csv.writer(line, delimiter=";", lineterminator="\r\n")
        for row, item in enumerate(table.findall(MAIN + "row"), 1):
            if row > 10_001 or item.get("r") != str(row):
                raise InvalidFile(f"linha_{row}_ausente_ou_excede_limite")
            values = [""] * len(HEADERS)
            previous = -1
            for cell in item.findall(MAIN + "c"):
                coordinate = CELL.fullmatch(cell.get("r", ""))
                if not coordinate or coordinate[2] != str(row):
                    raise InvalidFile(f"linha_{row}_celula_invalida")
                col = 0
                for letter in coordinate[1]:
                    col = col * 26 + ord(letter) - ord("A") + 1
                col -= 1
                if not previous < col < len(HEADERS):
                    raise InvalidFile(f"linha_{row}_coluna_invalida")
                previous = col
                values[col] = cell_text(cell, strings, col, row)
            writer.writerow(values)
            encoded = line.getvalue().encode("utf-8")
            if result.tell() + len(encoded) > MAX_BYTES:
                raise InvalidFile(f"linha_{row}_csv_excede_limite")
            result.write(encoded)
            line.seek(0)
            line.truncate()
        return result.getvalue()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(2)
    try:
        content = to_csv(sys.stdin.buffer.read(MAX_BYTES + 1))
        document = prepare_synthetic(content, sys.argv[1])
        document["csv"] = base64.b64encode(content).decode("ascii")
    except InvalidFile as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(2)
    except (BadZipFile, ET.ParseError, KeyError, UnicodeError, ValueError, OSError):
        print(json.dumps({"error": "xlsx_malformado"}))
        sys.exit(2)
    sys.stdout.buffer.write(json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
