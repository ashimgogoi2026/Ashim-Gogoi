import fs from "fs";
const file = "src/components/ImageSlides.tsx";
let code = fs.readFileSync(file, "utf8");
code = code.replace(/bg-red-/g, "bg-primary-");
code = code.replace(/text-red-/g, "text-primary-");
code = code.replace(/border-red-/g, "border-primary-");
fs.writeFileSync(file, code);
console.log("Done");
