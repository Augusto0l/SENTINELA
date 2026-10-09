import { useState } from "react";
import Header from "../components/Header";
import MapaDF, { type MapMode } from "../components/map/MapaDF";
import DonutChart from "../components/DonutChart";
import AnalyticsCard from "../components/AnalyticsCard";
import { RA_LIST, CRIME_NATURES, PERIODS, HOURS } from "../data/mockData";
import { MOCK_OCCURRENCES } from "../data/mockOccurrences";

interface CrimeMapProps {
  initialRaCode?: string;
}

const sparkData = [45, 52, 60, 55, 70, 68, 80, 78, 92, 88, 102, 115];

const OCCURRENCES_BY_RA: Record<string, number> = Object.fromEntries(
  RA_LIST.map((ra) => [ra.codigo, ra.occurrence_count])
);

const selectStyle: React.CSSProperties = {
  background: "#111d2e",
  border: "1px solid #1e3a5f",
  borderRadius: 6,
  color: "#94a3b8",
  fontSize: 12,
  padding: "6px 10px",
  cursor: "pointer",
  outline: "none",
  minWidth: 130,
};

export default function CrimeMap({ initialRaCode }: CrimeMapProps) {
  const [selectedRaCode, setSelectedRaCode] = useState<string | null>(initialRaCode ?? null);
  const [mapMode, setMapMode] = useState<MapMode>("heat");
  const [period, setPeriod] = useState("6m");
  const [nature, setNature] = useState("");
  const [hour, setHour] = useState("");

  const raInfo = selectedRaCode ? RA_LIST.find((r) => r.codigo === selectedRaCode) : null;

  const donutData = raInfo
    ? Object.entries(raInfo.crimes_by_nature).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }))
    : (() => {
        const nm: Record<string, number> = {};
        RA_LIST.forEach((r) => Object.entries(r.crimes_by_nature).forEach(([k, v]) => { nm[k] = (nm[k] ?? 0) + v; }));
        return Object.entries(nm).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }));
      })();

  const handleSelectRa = (raCode: string) => {
    setSelectedRaCode(raCode);
  };

  const handleBack = () => {
    setSelectedRaCode(null);
  };

  const handleClearFilters = () => {
    setSelectedRaCode(null);
    setPeriod("6m");
    setNature("");
    setHour("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <Header title="Mapa Criminal" subtitle="Análise geográfica detalhada" />

      {/* Filter bar */}
      <div
        style={{
          background: "#0d1626",
          borderBottom: "1px solid #1e3a5f",
          padding: "10px 24px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: "#475569", fontWeight: 600, letterSpacing: "0.06em", marginRight: 4 }}>FILTROS</span>

        <select style={selectStyle} value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value} style={{ background: "#111d2e" }}>{p.label}</option>
          ))}
        </select>

        <select
          style={selectStyle}
          value={selectedRaCode ?? ""}
          onChange={(e) => setSelectedRaCode(e.target.value || null)}
        >
          <option value="" style={{ background: "#111d2e" }}>Todas as regiões</option>
          {RA_LIST.map((ra) => (
            <option key={ra.codigo} value={ra.codigo} style={{ background: "#111d2e" }}>
              {ra.nomeCompleto}
            </option>
          ))}
        </select>

        <select style={selectStyle} value={nature} onChange={(e) => setNature(e.target.value)}>
          <option value="" style={{ background: "#111d2e" }}>Todas as naturezas</option>
          {CRIME_NATURES.map((n) => (
            <option key={n} value={n} style={{ background: "#111d2e" }}>{n}</option>
          ))}
        </select>

        <select style={selectStyle} value={hour} onChange={(e) => setHour(e.target.value)}>
          {HOURS.map((h) => (
            <option key={h.value} value={h.value} style={{ background: "#111d2e" }}>{h.label}</option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        <button
          onClick={handleClearFilters}
          style={{
            background: "transparent",
            border: "1px solid #1e3a5f",
            borderRadius: 6,
            color: "#64748b",
            fontSize: 12,
            padding: "6px 12px",
            cursor: "pointer",
          }}
        >
          Limpar filtros
        </button>

        <button
          style={{
            background: "#2563eb",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            padding: "6px 14px",
            cursor: "pointer",
          }}
        >
          Aplicar filtros
        </button>
      </div>

      {/* Breadcrumb */}
      {selectedRaCode && raInfo && (
        <div
          style={{
            background: "#0d1626",
            borderBottom: "1px solid #1e3a5f",
            padding: "8px 24px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 12, color: "#64748b" }}>Distrito Federal</span>
          <span style={{ fontSize: 12, color: "#334155" }}>›</span>
          <span style={{ fontSize: 12, color: "#93c5fd", fontWeight: 600 }}>{raInfo.nomeDisplay}</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleBack}
            style={{
              background: "transparent",
              border: "1px solid #1e3a5f",
              borderRadius: 5,
              color: "#60a5fa",
              fontSize: 11,
              padding: "4px 10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            ← Voltar para visão do DF
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Map area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "12px 0 12px 16px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10, paddingRight: 16 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", margin: 0, letterSpacing: "-0.02em" }}>
                {raInfo ? raInfo.nomeDisplay : "Mapa Criminal"}
              </h1>
              <p style={{ fontSize: 12, color: "#64748b", margin: "3px 0 0" }}>
                {raInfo
                  ? `Distribuição espacial das ocorrências em ${raInfo.nomeDisplay}`
                  : "Explore a distribuição espacial das ocorrências e identifique padrões por região."}
              </p>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {(["heat", "points", "clusters"] as MapMode[]).map((m) => (
                <button key={m} onClick={() => setMapMode(m)} style={{
                  background: mapMode === m ? "#2563eb" : "transparent",
                  border: mapMode === m ? "none" : "1px solid #1e3a5f",
                  borderRadius: 5, color: mapMode === m ? "#fff" : "#64748b",
                  fontSize: 11, fontWeight: mapMode === m ? 600 : 400,
                  padding: "4px 10px", cursor: "pointer",
                }}>
                  {m === "heat" ? "Calor" : m === "points" ? "Pontos" : "Clusters"}
                </button>
              ))}
            </div>
          </div>

          <div style={{
            flex: 1,
            minHeight: 0,
            background: "#111d2e",
            border: "1px solid #1e3a5f",
            borderRadius: 8,
            overflow: "hidden",
            position: "relative",
            marginRight: 16,
          }}>
            <MapaDF
              selectedRaCode={selectedRaCode}
              onSelectRa={handleSelectRa}
              occurrencesByRa={OCCURRENCES_BY_RA}
              showPoints={false}
              mapMode={mapMode}
              mockOccurrences={MOCK_OCCURRENCES}
            />
          </div>
        </div>

        {/* Side panel */}
        <div style={{ width: 270, flexShrink: 0, overflowY: "auto", padding: "12px 16px 12px 0", display: "flex", flexDirection: "column", gap: 10 }}>
          {raInfo && (
            <div style={{ background: "#111d2e", border: "1px solid #1e3a5f", borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
                Resumo — {raInfo.nomeDisplay}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>Total</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9" }}>{raInfo.occurrence_count.toLocaleString("pt-BR")}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>Variação</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: raInfo.variation > 0 ? "#22c55e" : "#ef4444" }}>
                    {raInfo.variation > 0 ? "+" : ""}{raInfo.variation.toFixed(1)}%
                  </div>
                </div>
              </div>
              <div style={{ borderTop: "1px solid #1e3a5f", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#475569" }}>Principal natureza</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{raInfo.most_common_crime}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    {((raInfo.crimes_by_nature[raInfo.most_common_crime] / raInfo.occurrence_count) * 100).toFixed(1)}% do total
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#475569" }}>Horário de maior incidência</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{raInfo.peak_hour}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#475569" }}>Dia da semana crítico</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{raInfo.peak_day}</div>
                </div>
              </div>
            </div>
          )}

          <AnalyticsCard
            label={raInfo ? `Variação — ${raInfo.nomeDisplay}` : "Variação geral"}
            value={raInfo ? `${raInfo.variation > 0 ? "+" : ""}${raInfo.variation.toFixed(1)}%` : "+8,4%"}
            sub="vs período anterior"
            variation={raInfo?.variation ?? 8.4}
            sparkData={sparkData}
            color={raInfo && raInfo.variation > 0 ? "#22c55e" : "#ef4444"}
          />

          <div style={{ background: "#111d2e", border: "1px solid #1e3a5f", borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase" }}>
              Indicadores rápidos
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>Horário crítico</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#f97316" }}>{raInfo?.peak_hour ?? "19h–23h"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>Dia crítico</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#f97316" }}>{raInfo?.peak_day ?? "Sábado"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>RAs monitoradas</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#93c5fd" }}>37</span>
              </div>
            </div>
          </div>

          <div style={{ background: "#111d2e", border: "1px solid #1e3a5f", borderRadius: 8, padding: "14px 16px" }}>
            <DonutChart data={donutData} title="Naturezas em destaque" size={150} />
          </div>

          <div style={{ background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: "#2563eb", fontWeight: 600, marginBottom: 6 }}>Sobre este mapa</div>
            <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.6 }}>
              {selectedRaCode
                ? `Visualizando ocorrências concentradas em ${raInfo?.nomeDisplay ?? selectedRaCode}. Clique em "Voltar para visão do DF" para ver o mapa completo.`
                : "Clique em qualquer Região Administrativa no mapa para ver dados detalhados e filtrar as ocorrências por área."}
            </div>
          </div>

          <div style={{ fontSize: 10, color: "#334155", textAlign: "center", fontStyle: "italic", paddingBottom: 4 }}>
            Dados demonstrativos para protótipo
          </div>
        </div>
      </div>
    </div>
  );
}
