# ADR — Contratos executáveis e OpenAPI gerado

Data: 28/10/2026. Status: implementado localmente; proposta para revisão da Etapa 3.

## Contexto

As telas demonstrativas têm regras próprias de formulário/importação e uma consulta analítica compartilhada. A futura integração precisa de payloads verificáveis sem transformar as simulações atuais em persistência. Manter schemas e especificação manualmente duplicados pode causar divergências.

## Decisão

Criar `src/contracts`, separado das telas e dos handlers, reutilizando Zod, catálogos internos e regras da Etapa 2. Gerar OpenAPI 3.1.1 e exemplos do registro de schemas; validar sincronização, estrutura e exemplos automaticamente. Refinamentos não representáveis no JSON Schema permanecem explícitos na documentação e nos testes Zod.

Propor namespace `/api/v1`, envelopes de sucesso/erro, data civil ISO para fatos e timestamps UTC para auditoria, com adaptadores para os formatos existentes. Não impor UUID/códigos oficiais. Representar ocorrência única com vários vínculos de natureza; preservar células brutas e linhas inválidas nos diagnósticos da importação. Separar resultados simulados de resultados operacionais futuros.

## Consequências

Não há endpoints novos, banco, Supabase, migrações ou autenticação. A UI não passa a consumir a API proposta. O proxy de geocodificação continua com seu contrato anterior; eventual migração exigirá integração explícita e testes. Validadores OpenAPI/JSON Schema são dependências somente de desenvolvimento. Compatibilidade com as Etapas 1 e 2 é verificada por adaptadores e testes, sem modificá-las.

Parâmetros, limites técnicos, IDs e modelos geográficos permanecem propostas sujeitas à homologação antes do backend. Datas/horários operacionais, upload, paginação de prévias e referência cartográfica em grande escala precisarão de decisões posteriores. Detalhes: [contratos v0.1.0](../contratos/api-v0.1.0.md).
