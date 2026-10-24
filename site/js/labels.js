// Code → label maps for every API enumeration (API contract C.3).
// The API sends and receives codes; the UI shows labels.

export const STATUS = {
  UNDER_REPAIR: "Under Repair",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
  DELIVERED: "Delivered",
};

export const DEVICE_TYPE = {
  LAPTOP: "Laptop",
  DESKTOP: "Desktop",
};

export const POWERS_ON = {
  YES: "Yes",
  NO: "No",
  NOT_TESTED: "Not tested",
};

export const SCREEN = {
  OK: "OK",
  SCRATCHED: "Scratched",
  CRACKED: "Cracked",
  DEAD_PIXELS: "Dead pixels",
  NO_DISPLAY: "No display",
};

export const KEYBOARD = {
  OK: "OK",
  MISSING_KEYS: "Missing keys",
  FAULTY_KEYS: "Faulty keys",
};

export const TOUCHPAD = {
  OK: "OK",
  FAULTY: "Faulty",
  NOT_APPLICABLE: "N/A (desktop)",
};

export const BATTERY = {
  OK: "OK",
  WEAK: "Weak",
  SWOLLEN: "Swollen",
  NOT_CHARGING: "Not charging",
  MISSING: "Missing",
};

export const BODY = {
  OK: "OK",
  SCRATCHES: "Scratches",
  DENTS: "Dents",
  CRACKED: "Cracked",
  HINGE_DAMAGE: "Hinge damage",
};

export const ACCESSORY = {
  CHARGER: "Charger",
  BAG: "Bag",
  MOUSE: "Mouse",
  SPARE_BATTERY: "Spare battery",
  POWER_CABLE: "Power cable",
};

/** The six `condition` keys in display order, with their row label and options. */
export const CONDITION_FIELDS = [
  { key: "powersOn", label: "Powers on", options: POWERS_ON },
  { key: "screen", label: "Screen", options: SCREEN },
  { key: "keyboard", label: "Keyboard", options: KEYBOARD },
  { key: "touchpad", label: "Touchpad", options: TOUCHPAD },
  { key: "battery", label: "Battery", options: BATTERY },
  { key: "body", label: "Body / casing", options: BODY },
];

// Codes shared between maps (OK, CRACKED, FAULTY, MISSING) have the same label in each.
const ALL = Object.assign({}, STATUS, DEVICE_TYPE, POWERS_ON, SCREEN, KEYBOARD, TOUCHPAD, BATTERY, BODY, ACCESSORY);

/** Label for any enumeration code. Unknown codes are returned unchanged; null/undefined → "". */
export function label(code) {
  if (code == null) return "";
  return Object.hasOwn(ALL, code) ? ALL[code] : String(code);
}
