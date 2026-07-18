# EurocontrolCLX

MVP analítico para simular estratégias de ajuste de EOBT e comparar impacto em CTOT/atrasos com dados históricos.

## Objetivo

Construir um simulador **offline** para:

- comparar políticas de ajuste de EOBT;
- avaliar impacto em atraso ATFM, atraso total de partida e estabilidade de CTOT;
- preparar a transição para integração operacional futura (NM B2B), quando houver acesso institucional.

## Escopo implementado (Fase 1 - offline)

- Motor de simulação local em Node.js.
- Três políticas iniciais:
  - `keep_original_eobt`
  - `proactive_risk_update`
  - `stability_postpone`
- Métricas por política:
  - `avgAtfmDelayMin`
  - `avgDepartureDelayMin`
  - `avgCtotShiftMin`
  - `slotMissCount`
  - `revisionCount`
  - Dataset de exemplo: `data/sample_flights.json`.

## Estrutura

- `src/policies.js`  
  Regras de política de ajuste de EOBT.
- `src/simulator.js`  
  Núcleo de simulação e agregação de métricas.
- `src/cli.js`  
  Execução via linha de comando.
- `test/simulator.test.js`  
  Testes automatizados.

## Como executar

```bash
cd <repo-root>
npm install
npm test
npm run simulate
```

## Modelo de dados mínimo (voo)

Cada voo no JSON deve conter:

- `flightId` (string)
- `eobtMin` (minuto de referência da EOBT)
- `readyMin` (minuto em que a aeronave de fato fica pronta)
- `initialCtotMin` (CTOT inicial)
- `regulationSeverity` (0.0 a 1.0)

## Fontes de dados para evolução

Para alimentar cenários históricos reais:

- ADRR (Aviation Data Repository for Research - EUROCONTROL)
- ANS Performance / Aviation Intelligence Portal
- CODA / Delay analytics da EUROCONTROL

## Fase 2 (planejada)

Integração operacional com NM B2B (quando disponível):

- ingestão de eventos de voo/slot em tempo quase real;
- validação de políticas com dados operacionais;
- evolução para apoio à decisão.

> Observação: NM B2B não é API pública aberta; depende de onboarding/acesso institucional.