/**
 * Renderiza todas as peças para as redes sociais em marketing/out/:
 *   out/<slug>/post.png (feed 4:5) e out/<slug>/reel.mp4 (Reels/Stories 9:16), mais out/geral/ e out/legendas.md.
 *
 * Uso (dentro de marketing/): node scripts/render-all.mjs [slug ...]   — sem argumentos, faz todos.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const cars = JSON.parse(readFileSync("src/data/cars.json", "utf8"));
const only = process.argv.slice(2);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const run = (args) => execFileSync(npx, ["remotion", ...args], { stdio: "inherit", shell: process.platform === "win32" });

for (const car of cars) {
  if (only.length && !only.includes(car.slug)) continue;
  const dir = path.join("out", car.slug);
  mkdirSync(dir, { recursive: true });
  console.log(`\n▶ ${car.make} ${car.model} ${car.year}`);
  run(["still", `Post-${car.slug}`, path.join(dir, "post.png")]);
  run(["render", `Reel-${car.slug}`, path.join(dir, "reel.mp4"), "--codec=h264", "--crf=18"]);
}

if (!only.length || only.includes("geral")) {
  mkdirSync(path.join("out", "geral"), { recursive: true });
  console.log("\n▶ Peças gerais");
  run(["still", "Post-Condicoes", path.join("out", "geral", "post-condicoes.png")]);
  run(["render", "Story-Condicoes", path.join("out", "geral", "story-condicoes.mp4"), "--codec=h264", "--crf=18"]);
}

copyFileSync("legendas.md", path.join("out", "legendas.md"));
console.log("\nok — ficheiros em marketing/out/");
