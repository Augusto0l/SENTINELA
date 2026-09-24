import { useRef, useState } from "react";
import Header from "../components/Header";
import MapaDF from "../components/map/MapaDF";
import { RA_BY_CODE, GEO_BOUNDS } from "../components/map/raMapData";
import { RA_LIST, CRIME_NATURES } from "../data/mockData";

// ─── Setores por RA ──────────────────────────────────────────────────────────
const SETORES_BY_RA: Record<string, string[]> = {
  "RA-I":     ["Asa Norte", "Asa Sul", "Setor Bancário Norte", "Setor Bancário Sul", "Setor Comercial Norte", "Setor Hoteleiro Norte", "Setor Hoteleiro Sul"],
  "RA-II":    ["Gama Leste", "Gama Norte", "Gama Oeste", "Gama Sul", "Setor Central"],
  "RA-III":   ["Taguatinga Norte", "Taguatinga Sul", "Setor C Norte", "Setor C Sul", "Setor D", "QNA", "QNB"],
  "RA-IV":    ["Brazlândia Sede", "Setor Norte", "Setor Sul", "Setor Veredas"],
  "RA-V":     ["Sobradinho I", "Setor de Indústrias", "Setor Residencial Norte", "Setor Residencial Sul"],
  "RA-VI":    ["Planaltina Sede", "Arapoanga", "Setor Leste", "Setor Norte", "Setor Oeste", "Setor Sul"],
  "RA-VII":   ["Paranoá", "Setor Residencial", "Itapoã", "Paranoá Parque"],
  "RA-VIII":  ["Núcleo Bandeirante", "Setor D", "Setor G", "Setor I"],
  "RA-IX":    ["Ceilândia Norte", "Ceilândia Sul", "Setor O", "Setor P Norte", "Setor P Sul", "QNM", "QNN", "QNQ", "Setor Industrial"],
  "RA-X":     ["Guará I", "Guará II", "Setor Industrial", "SCIA"],
  "RA-XI":    ["Cruzeiro Novo", "Cruzeiro Velho", "Setor Sudoeste"],
  "RA-XII":   ["Samambaia Norte", "Samambaia Sul", "QR", "QS", "Setor Industrial"],
  "RA-XIII":  ["Santa Maria Norte", "Santa Maria Sul", "Setor Central", "Setor Oeste"],
  "RA-XIV":   ["São Sebastião", "Setor Leste", "Setor Norte", "Setor Sul"],
  "RA-XV":    ["Recanto das Emas", "Setor Leste", "Setor Oeste", "QC", "QD"],
  "RA-XVI":   ["Lago Sul", "Setor de Mansões", "SQI", "SHIS"],
  "RA-XVII":  ["Riacho Fundo I", "Setor Industrial", "Setor P"],
  "RA-XVIII": ["Lago Norte", "Setor de Mansões", "SHIN", "SMHN"],
  "RA-XIX":   ["Candangolândia", "Setor Residencial"],
  "RA-XX":    ["Águas Claras", "Setor Comercial", "Setor Residencial Norte", "Setor Residencial Sul"],
  "RA-XXI":   ["Riacho Fundo II", "QN", "Setor Sul"],
  "RA-XXII":  ["Sudoeste", "Octogonal"],
  "RA-XXIII": ["Varjão", "Setor Residencial"],
  "RA-XXIV":  ["Park Way", "Setor de Mansões", "SMI"],
  "RA-XXV":   ["SCIA", "Estrutural", "Setor de Indústrias"],
  "RA-XXVI":  ["Sobradinho II", "Setor de Chácaras", "Setor Habitacional"],
  "RA-XXVII": ["Jardim Botânico", "Setor de Mansões", "SMPW"],
  "RA-XXVIII":["Itapoã", "Setor Norte", "Setor Sul"],
  "RA-XXIX":  ["SIA", "Setor Industrial", "Setor de Oficinas"],
  "RA-XXX":   ["Vicente Pires", "Colônia Agrícola", "Setor D", "Setor F"],
  "RA-XXXI":  ["Fercal", "Setor Habitacional", "Setor Industrial"],
  "RA-XXXII": ["Sol Nascente", "Pôr do Sol", "Setor P", "Setor Q"],
  "RA-XXXIII":["Arniqueira", "Setor Habitacional"],
  "RA-XXXIV": ["Arapoanga", "Setor Norte", "Setor Sul"],
  "RA-XXXV":  ["Água Quente", "Setor Rural"],
  "RA-XXXVI": ["26 de Setembro", "Setor Habitacional"],
  "RA-S":     ["Ponte Alta", "Setor Rural"],
};

const RESPONSAVEIS = ["Pedro Augusto", "Ana Lima", "Carlos Mendes", "Fernanda Rocha", "João Souza"];
const UNIDADES = ["PCDF – Delegacia 1ª", "PCDF – Delegacia 5ª", "PMDF – 1º BPM", "PMDF – 3º BPM", "DETRAN-DF", "SESP-DF"];

interface Errors { [k: string]: string }
interface Props { onBack?: () => void }

// ─── Shared styles ────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0a1525",
  border: "1px solid #1e3a5f",
  borderRadius: 6,
  color: "#f1f5f9",
  fontSize: 13,
  padding: "8px 12px",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color .15s",
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 5, display: "block",
};
const cardStyle: React.CSSProperties = {
  background: "#0d1a2d", border: "1px solid #1e3a5f", borderRadius: 10, padding: "18px 20px", marginBottom: 12,
};
const cardTitleStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: "#f1f5f9", marginBottom: 16, paddingBottom: 10, borderBottom: "1px solid #1e3a5f",
};
const errMsgStyle: React.CSSProperties = {
  fontSize: 10, color: "#ef4444", display: "block", marginTop: 3,
};
const req = <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>;

function errBorder(errors: Errors, field: string): React.CSSProperties {
  return errors[field] ? { borderColor: "#ef4444" } : {};
}

function raPinCoords(code: string) {
  const ra = RA_BY_CODE[code];
  if (!ra) return null;
  const lon = (ra.labelPoint.x - GEO_BOUNDS.padding) / (GEO_BOUNDS.cosLat * GEO_BOUNDS.scale) + GEO_BOUNDS.minLon;
  const lat = GEO_BOUNDS.maxLat - (ra.labelPoint.y - GEO_BOUNDS.padding) / GEO_BOUNDS.scale;
  return { x: ra.labelPoint.x, y: ra.labelPoint.y, lat, lon };
}

export default function NovaOcorrencia({ onBack }: Props) {
  const [natureza, setNatureza]     = useState("");
  const [data, setData]             = useState("");
  const [horario, setHorario]       = useState("");
  const [raCode, setRaCode]         = useState("");
  const [setor, setSetor]           = useState("");
  const [endereco, setEndereco]     = useState("");
  const [latitude, setLatitude]     = useState("");
  const [longitude, setLongitude]   = useState("");
  const [pinX, setPinX]             = useState<number | null>(null);
  const [pinY, setPinY]             = useState<number | null>(null);
  const [descricao, setDescricao]   = useState("");
  const [files, setFiles]           = useState<File[]>([]);
  const [responsavel, setResponsavel] = useState("Pedro Augusto");
  const [unidade, setUnidade]       = useState("");
  const [prioridade, setPrioridade] = useState<"baixa" | "media" | "alta">("media");
  const [errors, setErrors]         = useState<Errors>({});
  const [saving, setSaving]         = useState(false);
  const [success, setSuccess]       = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [dragOver, setDragOver]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const raInfo = raCode ? RA_LIST.find((r) => r.codigo === raCode) : null;
  const setores = raCode ? (SETORES_BY_RA[raCode] ?? []) : [];
  const hasData = !!(natureza || data || horario || raCode || descricao || files.length);

  function applyRaPin(code: string) {
    const coords = raPinCoords(code);
    if (!coords) return;
    setLatitude(coords.lat.toFixed(6));
    setLongitude(coords.lon.toFixed(6));
    setPinX(coords.x);
    setPinY(coords.y);
  }

  function selectRa(code: string) {
    setRaCode(code);
    setSetor("");
    setErrors((p) => ({ ...p, raCode: "", setor: "" }));
    if (code) applyRaPin(code);
    else { setPinX(null); setPinY(null); setLatitude(""); setLongitude(""); }
  }

  function handleMapClick(_svgX: number, _svgY: number, lat: number, lon: number) {
    setPinX(_svgX);
    setPinY(_svgY);
    setLatitude(lat.toFixed(6));
    setLongitude(lon.toFixed(6));
  }

  function handleFiles(fl: FileList | null) {
    if (!fl) return;
    setFiles((prev) => [...prev, ...Array.from(fl)]);
  }

  function validate(): Errors {
    const e: Errors = {};
    if (!natureza) e.natureza = "Selecione a natureza";
    if (!data) e.data = "Informe a data";
    if (!horario) e.horario = "Informe o horário";
    if (!raCode) e.raCode = "Selecione a RA";
    if (!setor) e.setor = "Selecione o bairro/setor";
    if (!descricao.trim()) e.descricao = "Descreva a ocorrência";
    if (!responsavel) e.responsavel = "Selecione o responsável";
    return e;
  }

  async function handleSave() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setSaving(true);
    await new Promise((r) => setTimeout(r, 1400));
    setSaving(false);
    setSuccess(true);
  }

  function handleCancel() {
    if (hasData) setShowCancel(true);
    else onBack?.();
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <Header title="Nova Ocorrência" subtitle="Registre uma nova ocorrência no sistema." />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(34,197,94,0.12)", border: "2px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "#22c55e" }}>✓</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9" }}>Ocorrência registrada com sucesso</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>A ocorrência foi salva e está disponível no sistema.</div>
          <button onClick={onBack} style={{ marginTop: 6, background: "#2563eb", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 700, padding: "9px 22px", cursor: "pointer" }}>
            Voltar ao Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <Header title="Nova Ocorrência" subtitle="Registre uma nova ocorrência no sistema." />

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px 24px" }}>
        {/* Back + Title */}
        <div style={{ marginBottom: 16 }}>
          <button onClick={handleCancel} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
            ← Voltar
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", margin: 0 }}>Nova ocorrência</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "3px 0 0" }}>Registre uma nova ocorrência no sistema.</p>
        </div>

        {/* Two-column grid */}
        <div style={{ display: "grid", gridTemplateColumns: "55fr 45fr", gap: 12, alignItems: "start" }}>

          {/* ══ LEFT ══════════════════════════════════════════════════════════ */}
          <div>
            {/* Card 1 – Informações */}
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Informações da ocorrência</div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Natureza da ocorrência{req}</label>
                  <select value={natureza} onChange={(e) => { setNatureza(e.target.value); setErrors((p) => ({ ...p, natureza: "" })); }}
                    style={{ ...inputStyle, ...errBorder(errors, "natureza") }}>
                    <option value="">Selecione a natureza</option>
                    {CRIME_NATURES.map((n) => <option key={n} value={n} style={{ background: "#0a1525" }}>{n}</option>)}
                  </select>
                  {errors.natureza && <span style={errMsgStyle}>{errors.natureza}</span>}
                </div>
                <div>
                  <label style={labelStyle}>Data{req}</label>
                  <input type="date" value={data} onChange={(e) => { setData(e.target.value); setErrors((p) => ({ ...p, data: "" })); }}
                    style={{ ...inputStyle, ...errBorder(errors, "data"), colorScheme: "dark" }} />
                  {errors.data && <span style={errMsgStyle}>{errors.data}</span>}
                </div>
                <div>
                  <label style={labelStyle}>Horário{req}</label>
                  <input type="time" value={horario} onChange={(e) => { setHorario(e.target.value); setErrors((p) => ({ ...p, horario: "" })); }}
                    style={{ ...inputStyle, ...errBorder(errors, "horario"), colorScheme: "dark" }} />
                  {errors.horario && <span style={errMsgStyle}>{errors.horario}</span>}
                </div>
              </div>
            </div>

            {/* Card 2 – Localização */}
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Localização</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={labelStyle}>Região Administrativa{req}</label>
                  <select value={raCode} onChange={(e) => selectRa(e.target.value)}
                    style={{ ...inputStyle, ...errBorder(errors, "raCode") }}>
                    <option value="">Selecione a RA</option>
                    {RA_LIST.map((ra) => <option key={ra.codigo} value={ra.codigo} style={{ background: "#0a1525" }}>{ra.nomeCompleto}</option>)}
                  </select>
                  {errors.raCode && <span style={errMsgStyle}>{errors.raCode}</span>}
                </div>
                <div>
                  <label style={labelStyle}>Bairro ou setor{req}</label>
                  <select value={setor} onChange={(e) => { setSetor(e.target.value); setErrors((p) => ({ ...p, setor: "" })); }}
                    disabled={!raCode} style={{ ...inputStyle, ...errBorder(errors, "setor"), opacity: raCode ? 1 : 0.5 }}>
                    <option value="">Selecione o bairro/setor</option>
                    {setores.map((s) => <option key={s} value={s} style={{ background: "#0a1525" }}>{s}</option>)}
                  </select>
                  {errors.setor && <span style={errMsgStyle}>{errors.setor}</span>}
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Endereço ou local</label>
                <input type="text" value={endereco} onChange={(e) => setEndereco(e.target.value)}
                  placeholder="Ex: QNN 25 Conjunto A, próximo ao mercado" style={inputStyle} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Latitude</label>
                  <input type="text" value={latitude} onChange={(e) => setLatitude(e.target.value)}
                    placeholder="Ex: -15.800000" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Longitude</label>
                  <input type="text" value={longitude} onChange={(e) => setLongitude(e.target.value)}
                    placeholder="Ex: -47.800000" style={inputStyle} />
                </div>
              </div>

              {/* Mini-map */}
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8, fontSize: 12, color: "#64748b" }}>
                <span>📍</span> Selecionar no mapa
              </div>
              <div style={{ height: 200, borderRadius: 8, overflow: "hidden", border: "1px solid #1e3a5f", position: "relative" }}>
                <MapaDF
                  selectedRaCode={raCode || null}
                  onSelectRa={(code) => selectRa(code)}
                  onClickPoint={handleMapClick}
                  pinX={pinX}
                  pinY={pinY}
                  occurrencesByRa={{}}
                  showPoints={false}
                  mapMode="heat"
                  mockOccurrences={[]}
                />
                <div style={{ position: "absolute", right: 8, top: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                  {["+", "−"].map((s) => (
                    <button key={s} style={{ width: 24, height: 24, background: "rgba(13,26,45,0.9)", border: "1px solid #1e3a5f", borderRadius: 4, color: "#64748b", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{s}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Card 3 – Descrição + Anexos */}
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Descrição da ocorrência</div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Descrição detalhada{req}</label>
                <textarea value={descricao} onChange={(e) => { setDescricao(e.target.value); setErrors((p) => ({ ...p, descricao: "" })); }}
                  placeholder="Descreva os detalhes da ocorrência..." rows={4}
                  style={{ ...inputStyle, resize: "vertical", minHeight: 90, ...errBorder(errors, "descricao") }} />
                {errors.descricao && <span style={errMsgStyle}>{errors.descricao}</span>}
              </div>

              <div>
                <label style={labelStyle}>Anexos</label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: `1.5px dashed ${dragOver ? "#2563eb" : "#1e3a5f"}`,
                    borderRadius: 8, padding: "22px 16px",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                    cursor: "pointer", background: dragOver ? "rgba(37,99,235,0.06)" : "transparent", transition: "all .15s",
                  }}
                >
                  <span style={{ fontSize: 22, color: "#334155" }}>☁</span>
                  <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
                    Arraste arquivos aqui ou <span style={{ color: "#2563eb", textDecoration: "underline" }}>clique para selecionar</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#475569" }}>Imagens, documentos, áudios ou vídeos (máx. 10MB cada)</div>
                  {files.length > 0 && (
                    <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center" }}>
                      {files.map((f, i) => (
                        <span key={i} style={{ fontSize: 10, background: "rgba(37,99,235,0.12)", color: "#60a5fa", borderRadius: 4, padding: "2px 7px" }}>{f.name}</span>
                      ))}
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
              </div>
            </div>
          </div>

          {/* ══ RIGHT ═════════════════════════════════════════════════════════ */}
          <div>
            {/* Card 4 – Overview map */}
            <div style={{ ...cardStyle, padding: 0, overflow: "hidden", marginBottom: 12 }}>
              <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #1e3a5f" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Localização no mapa</div>
              </div>
              <div style={{ height: 290, position: "relative" }}>
                <MapaDF
                  onSelectRa={(code) => selectRa(code)}
                  onClickPoint={handleMapClick}
                  pinX={pinX}
                  pinY={pinY}
                  occurrencesByRa={{}}
                  showPoints={false}
                  mapMode="heat"
                  mockOccurrences={[]}
                />
                <div style={{
                  position: "absolute", bottom: 8, right: 10,
                  fontSize: 10, color: "#475569", fontStyle: "italic",
                  background: "rgba(7,17,31,0.75)", padding: "3px 8px", borderRadius: 4,
                }}>
                  Clique no mapa para definir a localização
                </div>
              </div>
            </div>

            {/* Card 5 – Resumo */}
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Resumo da ocorrência</div>
              {([
                ["Natureza", natureza || "Não informada"],
                ["Data e horário", data && horario ? `${data.split("-").reverse().join("/")} às ${horario}` : "Não informados"],
                ["Local", [raInfo?.nomeDisplay, setor, endereco].filter(Boolean).join(" · ") || "Não informado"],
                ["Coordenadas", latitude && longitude ? `${latitude}, ${longitude}` : "Não definidas"],
                ["Descrição", descricao ? descricao.slice(0, 70) + (descricao.length > 70 ? "…" : "") : "Não informada"],
                ["Anexos", `${files.length} arquivo(s)`],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(30,58,95,0.45)" }}>
                  <span style={{ fontSize: 12, color: "#64748b", flexShrink: 0 }}>{k}</span>
                  <span style={{ fontSize: 12, color: "#94a3b8", textAlign: "right", wordBreak: "break-word", maxWidth: "65%" }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Card 6 – Informações adicionais */}
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Informações adicionais</div>

              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Responsável pelo registro{req}</label>
                <select value={responsavel} onChange={(e) => { setResponsavel(e.target.value); setErrors((p) => ({ ...p, responsavel: "" })); }}
                  style={{ ...inputStyle, ...errBorder(errors, "responsavel") }}>
                  <option value="">Selecione o responsável</option>
                  {RESPONSAVEIS.map((r) => <option key={r} value={r} style={{ background: "#0a1525" }}>{r}</option>)}
                </select>
                {errors.responsavel && <span style={errMsgStyle}>{errors.responsavel}</span>}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Unidade/Órgão</label>
                <select value={unidade} onChange={(e) => setUnidade(e.target.value)} style={inputStyle}>
                  <option value="">Selecione a unidade/órgão</option>
                  {UNIDADES.map((u) => <option key={u} value={u} style={{ background: "#0a1525" }}>{u}</option>)}
                </select>
              </div>

              <div>
                <label style={{ ...labelStyle, marginBottom: 12 }}>Prioridade</label>
                <div style={{ display: "flex", gap: 16 }}>
                  {([
                    { key: "baixa", label: "Baixa", color: "#22c55e" },
                    { key: "media", label: "Média", color: "#facc15" },
                    { key: "alta",  label: "Alta",  color: "#ef4444" },
                  ] as const).map(({ key, label, color }) => (
                    <label key={key} onClick={() => setPrioridade(key)}
                      style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12, color: prioridade === key ? "#f1f5f9" : "#64748b", userSelect: "none" }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: "50%",
                        border: `2px solid ${prioridade === key ? color : "#334155"}`,
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "border-color .15s",
                      }}>
                        {prioridade === key && <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />}
                      </span>
                      {label}
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div style={{
        borderTop: "1px solid #1e3a5f", background: "#080f1a",
        padding: "12px 20px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <button onClick={handleCancel}
          style={{ background: "transparent", border: "1px solid #1e3a5f", borderRadius: 7, color: "#94a3b8", fontSize: 13, padding: "9px 20px", cursor: "pointer" }}>
          Cancelar
        </button>
        <button onClick={handleSave} disabled={saving}
          style={{ background: "#2563eb", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 700, padding: "9px 24px", cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1, transition: "opacity .15s" }}>
          {saving ? "Salvando…" : "Salvar ocorrência"}
        </button>
        {Object.keys(errors).length > 0 && (
          <span style={{ fontSize: 12, color: "#ef4444" }}>Preencha os campos obrigatórios antes de salvar.</span>
        )}
      </div>

      {/* Discard dialog */}
      {showCancel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#0d1a2d", border: "1px solid #1e3a5f", borderRadius: 12, padding: "28px 32px", maxWidth: 380, width: "90%" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>Descartar alterações?</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 22 }}>Os dados preenchidos nesta ocorrência serão perdidos.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowCancel(false)} style={{ background: "transparent", border: "1px solid #1e3a5f", borderRadius: 7, color: "#94a3b8", fontSize: 13, padding: "8px 18px", cursor: "pointer" }}>Continuar editando</button>
              <button onClick={() => { setShowCancel(false); onBack?.(); }} style={{ background: "#ef4444", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 18px", cursor: "pointer" }}>Descartar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
