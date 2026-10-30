import fs from "fs";

let code = fs.readFileSync("src/components/ImageSlides.tsx", "utf8");

// Change targetProductNames to dynamic
code = code.replace(
  /const targetProductNames = \['BHIM BANANA OATS', 'CHOCOLATE DRINK', 'HIGH PROTEIN OATS'\];/g,
  `const targetProductNames = dashboardProducts.filter(p => !p.name.toUpperCase().startsWith('OTHERS ')).map(p => p.name).slice(0, 3);`
);

fs.writeFileSync("src/components/ImageSlides.tsx", code);
console.log("Replaced targetProductNames");
