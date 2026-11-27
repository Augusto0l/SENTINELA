"""Catalog comparator tests. No PostgreSQL connections or application DDL."""
from copy import deepcopy
import json
import sys
import unittest
from unittest.mock import patch

import compare_catalogs as comparator


DEFINITION = (
    'CREATE FUNCTION sentinela.exemplo() RETURNS text\n'
    'LANGUAGE sql AS $function$\n'
    "  -- preservar comentario, espacos e identificadores\n"
    "  SELECT 'valor; -- literal'::text;  \n"
    '$function$;\n'
)


def catalog(definition=DEFINITION):
    return {
        "functions": [["exemplo", "", definition, False, ["search_path=pg_catalog"]]],
        "columns": [["exemplo", "texto", "'linha\nseguinte'::text"]],
        "constraints": [["exemplo", "limite", "CHECK (valor > 0)"]],
    }


class ComparatorTests(unittest.TestCase):
    def assert_mismatch(self, left, right, category):
        # Exercise the CLI's actual mismatch detection, before object-count assertions.
        with patch.object(sys, "argv", ["compare_catalogs.py", "--local-db",
                         "sentinela_model_test_reference21", "--supabase-db",
                         "sentinela_model_test_supabase21"]):
            with patch.object(comparator, "snapshot", side_effect=[
                comparator.normalize_catalog(left), comparator.normalize_catalog(right)
            ]):
                with self.assertRaisesRegex(SystemExit, f"Catalog mismatch: {category}$"):
                    comparator.main()

    def test_crlf_lf_and_isolated_cr_are_equivalent(self):
        expected = comparator.normalize_catalog(catalog())
        for ending in ("\r\n", "\r", "\n"):
            with self.subTest(ending=repr(ending)):
                self.assertEqual(expected, comparator.normalize_catalog(catalog(DEFINITION.replace("\n", ending))))

    def test_only_line_terminators_change(self):
        original = ' \t-- comentario ç\r\nSELECT "Nome", \'a  b\', \'x\r\ny\';  \r/* fim */\n'
        expected = ' \t-- comentario ç\nSELECT "Nome", \'a  b\', \'x\ny\';  \n/* fim */\n'
        self.assertEqual(comparator.normalize_function_definition(original), expected)
        self.assertEqual(comparator.normalize_function_definition(expected), expected)

    def test_changed_sql_instruction_is_detected(self):
        self.assert_mismatch(catalog(), catalog(DEFINITION.replace("SELECT", "SELECT DISTINCT")), "functions")

    def test_changed_literal_is_detected(self):
        self.assert_mismatch(catalog(), catalog(DEFINITION.replace("valor; -- literal", "outro; -- literal")), "functions")

    def test_changed_identifier_is_detected(self):
        self.assert_mismatch(catalog(), catalog(DEFINITION.replace("sentinela.exemplo", "sentinela.outro")), "functions")

    def test_changed_comment_is_detected(self):
        self.assert_mismatch(catalog(), catalog(DEFINITION.replace("preservar comentario", "alterar comentario")), "functions")

    def test_changed_whitespace_is_detected(self):
        self.assert_mismatch(catalog(), catalog(DEFINITION.replace("  SELECT", " SELECT")), "functions")

    def test_other_categories_keep_their_line_endings(self):
        for category in ("columns", "constraints"):
            with self.subTest(category=category):
                left = catalog()
                left[category][0][-1] = "linha\nseguinte"
                right = deepcopy(left)
                right[category][0][-1] = "linha\r\nseguinte"
                self.assert_mismatch(left, right, category)

    def test_changed_constraint_is_detected(self):
        right = catalog()
        right["constraints"][0][-1] = "CHECK (valor >= 0)"
        self.assert_mismatch(catalog(), right, "constraints")

    def test_function_metadata_is_not_eol_normalized(self):
        left = catalog()
        left["functions"][0][1] = '"arg\nnome" text'
        right = deepcopy(left)
        right["functions"][0][1] = '"arg\rnome" text'
        self.assert_mismatch(left, right, "functions")

    def test_snapshot_uses_normalization_without_mutating_input(self):
        raw = catalog(DEFINITION.replace("\n", "\r\n"))
        unchanged = deepcopy(raw)
        database = "sentinela_model_test_reference21"
        with patch.object(comparator, "query", side_effect=[
            json.dumps([database, "::1", 5432, "public"]), json.dumps(raw)
        ]):
            actual = comparator.snapshot("psql", database, "public")
        self.assertEqual(actual, comparator.normalize_catalog(catalog()))
        self.assertEqual(raw, unchanged)


if __name__ == "__main__":
    unittest.main()
