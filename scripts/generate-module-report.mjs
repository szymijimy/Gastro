
import fs from "node:fs";
import path from "node:path";

const input = "docs/generated/dependencies.json";
const output = "docs/generated/module-inventory.md";

if (!fs.existsSync(input)) {
  console.error(`Nie znaleziono pliku: ${input}`);
  console.error("Najpierw uruchom Madge i wygeneruj dependencies.json.");
  process.exit(1);
}

const raw = fs.readFileSync(input, "utf8").replace(/^\uFEFF/, "");
const graph = JSON.parse(raw);
const files = Object.keys(graph).sort();

const dependents = new Map(
  files.map((file) => [file, []])
);

for (const [file, dependencies] of Object.entries(graph)) {
  for (const dependency of dependencies) {
    if (!dependents.has(dependency)) {
      dependents.set(dependency, []);
    }

    dependents.get(dependency).push(file);
  }
}

function classify(file) {
  if (file.startsWith("app/")) return "Strona / konfiguracja aplikacji";
  if (file.startsWith("components/ui/")) return "Współdzielony komponent UI";
  if (file.startsWith("components/")) return "Moduł / komponent aplikacji";
  if (file.startsWith("lib/")) return "Biblioteka / logika pomocnicza";
  return "Inne";
}

const sections = [
  "# Inwentaryzacja modułów projektu",
  "",
  `Liczba plików w grafie: ${files.length}`,
  "",
  "Raport wygenerowany automatycznie na podstawie importów.",
  "",
  "> Zależność oznacza import wykryty przez Madge. Nie jest to pełna analiza zachowania aplikacji.",
  "",
  "## Podsumowanie",
  "",
  "| Kategoria | Liczba plików |",
  "|---|---:|",
];

const categories = new Map();

for (const file of files) {
  const category = classify(file);
  categories.set(category, (categories.get(category) ?? 0) + 1);
}

for (const [category, count] of categories) {
  sections.push(`| ${category} | ${count} |`);
}

sections.push("", "## Szczegółowy wykaz", "");

for (const file of files) {
  const deps = graph[file] ?? [];
  const usedBy = dependents.get(file) ?? [];

  sections.push(
    `### \`${file}\``,
    "",
    `- **Kategoria:** ${classify(file)}`,
    `- **Liczba zależności:** ${deps.length}`,
    `- **Liczba plików korzystających z tego modułu:** ${usedBy.length}`,
    "",
    "**Importuje:**",
    ...(deps.length
      ? deps.map((dep) => `- \`${dep}\``)
      : ["- Brak zależności wykrytych przez Madge."]),
    "",
    "**Wykorzystywany przez:**",
    ...(usedBy.length
      ? usedBy.sort().map((file) => `- \`${file}\``)
      : ["- Brak zależności przychodzących w analizowanym grafie."]),
    ""
  );
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, sections.join("\n"), "utf8");

console.log(`Raport zapisano w: ${output}`);
console.log(`Liczba plików: ${files.length}`);
