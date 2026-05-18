import fs from "fs";

const path = "app/page.tsx";
let s = fs.readFileSync(path, "utf8");

const gridOld = `              <motionlessPlaceholderDiv className="mt-2 grid grid-cols-2 gap-2">`;

// fix accidental typos if any
s = s.replaceAll("<motionlessPlaceholderDiv", "<div").replaceAll("</motionlessPlaceholderDiv>", "</motionlessPlaceholderDiv>");

// re-read after fix - actually replace motionless with div
s = fs.readFileSync(path, "utf8");
s = s.replace(/<\/?motionlessPlaceholderDiv/g, (m) =>
  m.includes("/") ? "</div" : "<motionlessPlaceholderDiv".replace("motionlessPlaceholderDiv", "motionlessPlaceholderDiv"),
);
