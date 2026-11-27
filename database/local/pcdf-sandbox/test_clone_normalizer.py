"""The default restore accepts only the known gestao_lote OR regrouping."""
import unittest

import operational_clone as clones

HEADER = "CREATE POLICY gestao_lote ON sentinela.lotes_importacao FOR SELECT TO sentinela_gestao_owner USING ((EXISTS ( SELECT"
KEY = "  WHERE ((x.id = lotes_importacao.extracao_id) AND "
DUMPED = KEY + "(((((x.fonte)::text = 'PCDF'::text) AND ((lotes_importacao.versao_contrato)::text = '1.0'::text)) OR (((x.fonte)::text = 'PCDF'::text) AND ((lotes_importacao.versao_contrato)::text = '2.0'::text))) OR (((x.fonte)::text = 'IMPORTACAO-GERAL-LOCAL'::text) AND ((lotes_importacao.versao_contrato)::text = 'geral-v1'::text)))))));"
RESTORED = KEY + "((((x.fonte)::text = 'PCDF'::text) AND ((lotes_importacao.versao_contrato)::text = '1.0'::text)) OR (((x.fonte)::text = 'PCDF'::text) AND ((lotes_importacao.versao_contrato)::text = '2.0'::text)) OR (((x.fonte)::text = 'IMPORTACAO-GERAL-LOCAL'::text) AND ((lotes_importacao.versao_contrato)::text = 'geral-v1'::text)))))));"


class NormalizerTests(unittest.TestCase):
    def test_known_regrouping_matches(self):
        source = [HEADER, "   FROM sentinela.extracoes_origem x", DUMPED]
        restored = [HEADER, "   FROM sentinela.extracoes_origem x", RESTORED]
        self.assertEqual(clones.lot_policy_schema(source), clones.lot_policy_schema(restored))
        self.assertEqual(source[2], DUMPED, "input is not mutated")

    def test_other_changes_still_differ(self):
        changed = RESTORED.replace("'geral-v1'", "'geral-v2'")
        source = [HEADER, "x", DUMPED]
        self.assertNotEqual(clones.lot_policy_schema(source), clones.lot_policy_schema([HEADER, "x", changed]))
        other = ["CREATE POLICY outra ON t", "x", DUMPED]
        self.assertNotEqual(clones.lot_policy_schema(other), clones.lot_policy_schema(["CREATE POLICY outra ON t", "x", RESTORED]))


if __name__ == "__main__":
    unittest.main()
