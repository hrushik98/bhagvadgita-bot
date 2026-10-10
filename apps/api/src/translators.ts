import type { Language } from "@gita/shared";

/** Translations shown by default in the UI and given to the model. */
export const PRIMARY_TRANSLATORS: Record<Language, string> = {
  english: "Swami Sivananda",
  hindi: "Swami Ramsukhdas",
};

/** English translations combined into each verse's search document. */
export const EMBEDDED_TRANSLATORS = [
  "Swami Sivananda",
  "Swami Gambirananda",
  "Shri Purohit Swami",
];

/** Display order of all translations kept from the dataset. */
export const TRANSLATOR_ORDER = [
  "Swami Sivananda",
  "Swami Gambirananda",
  "Swami Adidevananda",
  "Shri Purohit Swami",
  "Dr. S. Sankaranarayan",
  "Swami Ramsukhdas",
  "Swami Tejomayananda",
];
