/**
 * AFTN Flight Plan (ICAO Doc 4444 / EUROCONTROL) parser.
 *
 * Supported format (one field per line, parentheses optional):
 *
 *   (FPL-PRABC-IS
 *   -C172/L-S/C
 *   -SBGR0230
 *   -N0120F080 DCT
 *   -SBGL0130 SBGR
 *   -RMK/...)
 *
 * Returns a plain object with the extracted fields.
 * Throws an Error with a descriptive message if mandatory fields are missing.
 */

const SLOT_WINDOW_EARLY_MIN = 5;   // off-block must not be earlier than CTOT − 5
const SLOT_WINDOW_LATE_MIN = 10;   // off-block must not be later than CTOT + 10
const PROACTIVE_THRESHOLD_MIN = 15;
const STABILITY_ROUNDING_STEP_MIN = 5;

// ─── helpers ────────────────────────────────────────────────────────────────

function hhmmToMin(hhmm) {
  const h = parseInt(hhmm.slice(0, 2), 10);
  const m = parseInt(hhmm.slice(2, 4), 10);
  return h * 60 + m;
}

function minToHHMM(min) {
  const h = Math.floor(min / 60) % 24;
  const m = Math.abs(min) % 60;
  return String(h).padStart(2, "0") + String(m).padStart(2, "0");
}

// ─── parser ─────────────────────────────────────────────────────────────────

/**
 * Parse an AFTN FPL string and return structured flight data.
 *
 * @param {string} text  Raw FPL text (parentheses and newlines are handled).
 * @returns {{
 *   callsign: string,
 *   flightRules: string,
 *   aircraftType: string|null,
 *   wakeTurbulence: string|null,
 *   adep: string,
 *   eobtHHMM: string,
 *   eobtMin: number,
 *   ades: string|null,
 *   eetHHMM: string|null,
 *   eetMin: number|null,
 *   altn: string|null
 * }}
 */
function parseAftnFpl(text) {
  const lines = text
    .replace(/^\s*\(/, "")
    .replace(/\)\s*$/, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("Invalid FPL format: empty input");
  }

  // Field 7 — first line: FPL-{ACID}-{RULES}{FLT_TYPE}
  const f7Match = lines[0].match(/^FPL-([A-Z0-9]{2,7})-([IVY]{1,2})([SGMXZ])/);
  if (!f7Match) {
    throw new Error(
      "Invalid FPL format: field 7 not found (expected 'FPL-ACID-RULESFLT_TYPE')"
    );
  }
  const callsign = f7Match[1];
  const flightRules = f7Match[2];

  let aircraftType = null;
  let wakeTurbulence = null;
  let adep = null;
  let eobtHHMM = null;
  let ades = null;
  let eetHHMM = null;
  let altn = null;

  // Remaining lines — each starts with '-' (strip it)
  const fieldLines = lines.slice(1).map((l) => (l.startsWith("-") ? l.slice(1) : l));

  for (const field of fieldLines) {
    // Field 9: {AIRCRAFT_TYPE}/{WAKE}-{EQUIPMENT}
    // E.g. "C172/L-S/C"  or  "B738/M-SDE2E3FGHIJ1RWXYZ/LB1"
    if (!aircraftType) {
      const f9 = field.match(/^([A-Z][A-Z0-9]{1,3})\/([JHLM])-/);
      if (f9) {
        aircraftType = f9[1];
        wakeTurbulence = f9[2];
        continue;
      }
    }

    // Field 13: {ADEP}{EOBT}  — exactly 4 alpha ICAO + 4 digit HHMM (nothing else on line)
    if (!adep) {
      const f13 = field.match(/^([A-Z]{4})(\d{4})$/);
      if (f13) {
        adep = f13[1];
        eobtHHMM = f13[2];
        continue;
      }
    }

    // Field 16: {ADES}{TOTAL_EET} [ALTN...]
    // Starts with 4 alpha + 4 digits, optionally followed by alternates
    if (adep && !ades) {
      const f16 = field.match(/^([A-Z]{4})(\d{4})(?:\s+(.+))?$/);
      if (f16) {
        ades = f16[1];
        eetHHMM = f16[2];
        // First token after EET is the primary alternate
        altn = f16[3] ? f16[3].trim().split(/\s+/)[0] : null;
        continue;
      }
    }
  }

  if (!adep || !eobtHHMM) {
    throw new Error(
      "Invalid FPL format: field 13 (departure aerodrome + EOBT) not found"
    );
  }

  return {
    callsign,
    flightRules,
    aircraftType,
    wakeTurbulence,
    adep,
    eobtHHMM,
    eobtMin: hhmmToMin(eobtHHMM),
    ades: ades || null,
    eetHHMM: eetHHMM || null,
    eetMin: eetHHMM ? hhmmToMin(eetHHMM) : null,
    altn: altn || null,
  };
}

// ─── CTOT planner ────────────────────────────────────────────────────────────

/**
 * Given a parsed FPL and a CTOT assigned by Eurocontrol, compute the
 * recommended EOBT revision under each of the three standard strategies.
 *
 * @param {ReturnType<typeof parseAftnFpl>} parsedFpl
 * @param {number} ctotMin  CTOT in minutes from midnight UTC
 * @returns {{
 *   callsign: string,
 *   adep: string,
 *   ades: string|null,
 *   originalEobtMin: number,
 *   ctotMin: number,
 *   atfmDelayMin: number,
 *   slotWindow: { openMin: number, closeMin: number },
 *   strategies: Record<string, { eobtMin: number, revisionMin: number, label: string, note: string }>
 * }}
 */
function planCtot(parsedFpl, ctotMin) {
  const { callsign, adep, ades, eobtMin } = parsedFpl;
  const atfmDelayMin = ctotMin - eobtMin;
  const slotOpenMin = ctotMin - SLOT_WINDOW_EARLY_MIN;
  const slotCloseMin = ctotMin + SLOT_WINDOW_LATE_MIN;

  // Strategy: keep original EOBT
  const keepEobt = eobtMin;

  // Strategy: proactive — revise upward to slot open when delay exceeds threshold
  const proactiveEobt =
    atfmDelayMin > PROACTIVE_THRESHOLD_MIN ? slotOpenMin : eobtMin;

  // Strategy: stability — proactive target rounded up to nearest 5-min boundary
  const rawStability = Math.max(eobtMin, slotOpenMin);
  const stabilityEobt =
    Math.ceil(rawStability / STABILITY_ROUNDING_STEP_MIN) *
    STABILITY_ROUNDING_STEP_MIN;

  const fmt = (min) => minToHHMM(min) + " UTC";

  return {
    callsign,
    adep,
    ades,
    originalEobtMin: eobtMin,
    ctotMin,
    atfmDelayMin,
    slotWindow: { openMin: slotOpenMin, closeMin: slotCloseMin },
    strategies: {
      keep_original_eobt: {
        label: "Keep Original EOBT",
        eobtMin: keepEobt,
        revisionMin: 0,
        note: `File EOBT ${fmt(keepEobt)} as-is. ATFM delay: ${atfmDelayMin} min.`,
      },
      proactive_revision: {
        label: "Proactive Revision",
        eobtMin: proactiveEobt,
        revisionMin: proactiveEobt - eobtMin,
        note:
          atfmDelayMin > PROACTIVE_THRESHOLD_MIN
            ? `Revise EOBT to ${fmt(proactiveEobt)} (CTOT − 5 min). Gain ${proactiveEobt - eobtMin} min of preparation time.`
            : `Delay ≤ ${PROACTIVE_THRESHOLD_MIN} min — no revision needed, keep ${fmt(eobtMin)}.`,
      },
      stability_rounded: {
        label: "Stability (Rounded)",
        eobtMin: stabilityEobt,
        revisionMin: stabilityEobt - eobtMin,
        note: `Revise EOBT to ${fmt(stabilityEobt)} (nearest 5-min boundary ≤ slot open). Gain ${stabilityEobt - eobtMin} min of preparation time.`,
      },
    },
  };
}

module.exports = { parseAftnFpl, planCtot, hhmmToMin, minToHHMM };
