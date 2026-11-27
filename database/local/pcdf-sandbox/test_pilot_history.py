"""Regression coverage for chronological staging decisions without signing institutional records."""
import unittest

from pilot_history import file_name, reconciliation, sequence, verify_acceptance
from pipeline import InvalidFile

JAN, FEB, MAR = "2021-01", "2021-02", "2021-03"
MANIFEST = {"fonte": {"sha256": "a" * 64}, "versao_tratamento": "test"}
DIGEST = "b" * 64
MONTHS = {month: {"linhas": i, "bytes": i * 100, "sha256": str(i) * 64}
          for i, month in enumerate((JAN, FEB, MAR), 1)}


def saved(month):
    info = MONTHS[month]
    return {"competencia": month, "arquivo": file_name(month), "csv": info["sha256"],
            "manifesto": DIGEST, "xml": MANIFEST["fonte"]["sha256"], "bytes": info["bytes"],
            "contrato": "1.0", "tratamento": "test", "lote": f"lot-{month}", "execucao": f"run-{month}",
            "status": "concluida", "ocorrencias": 0, "associacoes": 0, "foraStaging": 0,
            "recibos": [f"request-{month}"],
            **dict.fromkeys(("esperadas", "lidas", "processadas", "snapshots", "origens"), info["linhas"])}


def accepted(month):
    run = saved(month)
    return {"competencia": month, "manifesto_sha256": DIGEST, "csv_sha256": run["csv"],
            "lote": run["lote"], "execucao": run["execucao"], "requisicao": run["recibos"][0],
            "referencia": f"test/{month}", "publicacao": False, "consolidacao": False,
            "reconciliacao": reconciliation(MONTHS[month]["linhas"])}


class SequenceTests(unittest.TestCase):
    def plan(self, *, runs=(), attempts=(), signoffs=None, promoted=0):
        return sequence(MANIFEST, MONTHS, DIGEST, {"runs": runs, "attempts": attempts, "consolidacoes": promoted},
                        (signoffs or {}).get)

    def test_unsorted_manifest_only_selects_first_month_and_preserves_retry(self):
        attempt = {"requisicao": "test-uuid", "manifesto": DIGEST, "csv": MONTHS[JAN]["sha256"],
                   "autorizacao": "c" * 64}
        result = self.plan(attempts=[attempt])
        self.assertEqual(result["proxima"]["ultima_tentativa"], attempt)
        self.assertEqual([row["estado"] for row in result["competencias"]],
                         ["AGUARDANDO_AUTORIZACOES", "BLOQUEADA_ANTERIOR", "BLOQUEADA_ANTERIOR"])

    def test_durable_execution_blocks_reimport_and_next_month_until_acceptance(self):
        self.assertEqual(self.plan(runs=[saved(JAN)])["proxima"]["estado"], "AGUARDANDO_ACEITE")
        accepted_jan = self.plan(runs=[saved(JAN)], signoffs={JAN: accepted(JAN)})
        self.assertEqual(accepted_jan["competencias"][0]["estado"], "ACEITA")
        self.assertEqual(accepted_jan["proxima"]["competencia"], FEB)

    def test_rejects_advance_or_signoff_without_prior_durable_acceptance(self):
        for inputs in ({"runs": [saved(FEB)]}, {"runs": [saved(JAN), saved(FEB)]},
                       {"signoffs": {JAN: accepted(JAN)}},
                       {"attempts": [{"manifesto": DIGEST, "csv": MONTHS[MAR]["sha256"]}]}):
            with self.subTest(inputs=list(inputs)), self.assertRaises(InvalidFile):
                self.plan(**inputs)

    def test_rejects_duplicates_promotions_and_unreconciled_or_unaudited_runs(self):
        for inputs in ({"runs": [saved(JAN), saved(JAN)]}, {"promoted": 1},
                       {"runs": [{**saved(JAN), "manifesto": "c" * 64}]},
                       {"runs": [{**saved(JAN), "recibos": []}]},
                       {"runs": [{**saved(JAN), "origens": 0}]},
                       {"runs": [{**saved(JAN), "foraStaging": 1}]}):
            with self.subTest(inputs=list(inputs)), self.assertRaises(InvalidFile):
                self.plan(**inputs)

    def test_acceptance_is_bound_to_receipt_and_whole_comparison(self):
        signed = accepted(JAN)
        for mutated in ({**signed, "requisicao": "other"}, {**signed, "publicacao": True},
                        {**signed, "reconciliacao": {"rows": 1, "distinctIds": 1}},
                        {**signed, "reconciliacao": {**signed["reconciliacao"], "originalDifferences": 1}}):
            with self.subTest(), self.assertRaises(InvalidFile):
                verify_acceptance(mutated, saved(JAN), 1)

    def test_full_accepted_sequence_returns_no_candidate(self):
        result = self.plan(runs=[saved(month) for month in MONTHS],
                           signoffs={month: accepted(month) for month in MONTHS})
        self.assertIsNone(result["proxima"])


if __name__ == "__main__":
    unittest.main()
