import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "db.json");

const freshDb = () => ({ persons: [], ratings: [], counters: { person: 1, rating: 1 } });

const loadDb = () => {
  if (!fs.existsSync(DB_PATH)) return freshDb();
  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("No se pudo leer la DB, se reinicia", err);
    return freshDb();
  }
};

const saveDb = (data) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

let db = loadDb();
const app = express();
app.use(cors());
app.use(express.json());

const nowISO = () => new Date().toISOString();

app.get("/api/persons", (_req, res) => {
  const persons = [...db.persons].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "accent" })
  );
  res.json(persons);
});

app.post("/api/persons", (req, res) => {
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "El nombre es requerido" });
  const exists = db.persons.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (exists) return res.status(409).json({ error: "La persona ya existe" });
  const id = db.counters.person++;
  db.persons.push({ id, name, created_at: nowISO() });
  saveDb(db);
  return res.status(201).json({ id, name });
});

app.get("/api/ratings", (req, res) => {
  const { personId, order } = req.query;
  const orderOptions = {
    score_desc: (a, b) => b.score - a.score,
    score_asc: (a, b) => a.score - b.score,
    place_asc: (a, b) => a.place.localeCompare(b.place, undefined, { sensitivity: "accent" }),
    place_desc: (a, b) => b.place.localeCompare(a.place, undefined, { sensitivity: "accent" }),
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  };
  const sorter = orderOptions[order] || orderOptions.newest;

  const personsMap = new Map(db.persons.map((p) => [String(p.id), p]));
  let rows = db.ratings
    .map((r) => ({
      id: r.id,
      food: r.food,
      place: r.place,
      score: r.score,
      notes: r.notes,
      createdAt: r.created_at,
      person: personsMap.get(String(r.person_id)),
    }))
    .filter((r) => r.person);

  if (personId) rows = rows.filter((r) => String(r.person.id) === String(personId));
  rows.sort(sorter);
  res.json(rows);
});

app.post("/api/ratings", (req, res) => {
  const { personId, food, place, score, notes } = req.body || {};
  if (!personId || !food || !place || score === undefined) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }
  const trimmedFood = String(food).trim();
  const trimmedPlace = String(place).trim();
  const numScore = Number(score);
  if (!trimmedFood || !trimmedPlace) {
    return res.status(400).json({ error: "Comida y lugar son requeridos" });
  }
  if (!Number.isInteger(numScore) || numScore < 1 || numScore > 10) {
    return res.status(400).json({ error: "El puntaje debe ser un entero 1-10" });
  }
  const person = db.persons.find((p) => String(p.id) === String(personId));
  if (!person) return res.status(400).json({ error: "Persona no valida" });

  const id = db.counters.rating++;
  db.ratings.push({
    id,
    person_id: person.id,
    food: trimmedFood,
    place: trimmedPlace,
    score: numScore,
    notes: notes || "",
    created_at: nowISO(),
  });
  saveDb(db);
  return res.status(201).json({ message: "Guardado" });
});

const frontendPath = path.resolve(__dirname, "../frontend");
app.use(express.static(frontendPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
