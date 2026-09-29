// Claw Friends mockup art: shared SVG defs + helpers.
const INK = "#4A3A5E";

const SPARKLE = "M0,-6 C1,-1.5 1.5,-1 6,0 C1.5,1 1,1.5 0,6 C-1,1.5 -1.5,1 -6,0 C-1.5,-1 -1,-1.5 0,-6 Z";
const sparkle = (x, y, s = 1, fill = "#FFE08A") =>
  `<path d="${SPARKLE}" transform="translate(${x} ${y}) scale(${s})" fill="${fill}" stroke="${INK}" stroke-width="${1.6 / s}" stroke-linejoin="round"/>`;

const flower = (x, y, c) => {
  let p = "";
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 - 90) * Math.PI / 180;
    p += `<circle cx="${(x + Math.cos(a) * 4.6).toFixed(1)}" cy="${(y + Math.sin(a) * 4.6).toFixed(1)}" r="4.2" fill="${c}"/>`;
  }
  return `<g stroke="${INK}" stroke-width="1.8">${p}</g><circle cx="${x}" cy="${y}" r="2.6" fill="#FFE08A" stroke="${INK}" stroke-width="1.4"/>`;
};

const DUCK_BODY = "M60,14 C86,14 104,34 104,58 C104,84 86,100 60,100 C34,100 16,84 16,58 C16,34 34,14 60,14 Z";

const DEFS = `
<clipPath id="duck-clip"><path d="${DUCK_BODY}"/></clipPath>
<g id="duck-base">
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <ellipse cx="44" cy="99" rx="10" ry="5.5" fill="#FFB25E"/>
    <ellipse cx="76" cy="99" rx="10" ry="5.5" fill="#FFB25E"/>
    <path d="M24,54 C10,58 8,76 21,81 C23,72 24,63 24,54 Z" fill="#fff"/>
    <path d="M96,54 C110,58 112,76 99,81 C97,72 96,63 96,54 Z" fill="#fff"/>
  </g>
  <path d="${DUCK_BODY}" fill="#fff"/>
  <path d="M104,62 C101,86 82,100 58,100 C80,93 96,80 104,62 Z" fill="#ECE5F6" clip-path="url(#duck-clip)"/>
  <path d="${DUCK_BODY}" fill="none" stroke="${INK}" stroke-width="3"/>
  <ellipse cx="38" cy="64" rx="7" ry="4" fill="#FFB3C6"/>
  <ellipse cx="82" cy="64" rx="7" ry="4" fill="#FFB3C6"/>
  <ellipse cx="46" cy="54" rx="3.6" ry="4.4" fill="${INK}"/>
  <ellipse cx="74" cy="54" rx="3.6" ry="4.4" fill="${INK}"/>
  <circle cx="47.2" cy="52.4" r="1.2" fill="#fff"/>
  <circle cx="75.2" cy="52.4" r="1.2" fill="#fff"/>
  <path d="M51,61 C51,56.5 69,56.5 69,61 C69,65.5 64.5,68 60,68 C55.5,68 51,65.5 51,61 Z" fill="#FFB25E" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M53.5,62 Q60,64.5 66.5,62" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
</g>

<g id="duck-tuft">
  <path d="M57,15 C54,8 58,4 62,6 M61,14 C63,8 68,7 70,10" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
</g>

<g id="acc-frog">
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <circle cx="37" cy="19" r="11" fill="#A8DB9A"/>
    <circle cx="83" cy="19" r="11" fill="#A8DB9A"/>
    <path d="M15,64 C10,32 32,12 60,12 C88,12 110,32 105,64 C100,51 89,43 78,40 C68,37 52,37 42,40 C31,43 20,51 15,64 Z" fill="#A8DB9A"/>
    <circle cx="37" cy="18" r="6" fill="#fff" stroke-width="2"/>
    <circle cx="83" cy="18" r="6" fill="#fff" stroke-width="2"/>
  </g>
  <circle cx="37" cy="18.8" r="3" fill="${INK}"/>
  <circle cx="83" cy="18.8" r="3" fill="${INK}"/>
  <path d="M50,27 Q60,31 70,27" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
</g>

<g id="acc-straw">
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <ellipse cx="60" cy="25" rx="44" ry="10" fill="#F6D58E"/>
    <path d="M36,25 C36,3 84,3 84,25 C76,28 44,28 36,25 Z" fill="#F6D58E"/>
    <path d="M37,17 C50,20.5 70,20.5 83,17 L84,23.5 C70,27 50,27 36,23.5 Z" fill="#FDB8D5" stroke-width="2.5"/>
    <path d="M84,20 C92,12 98,18 90,22 C98,26 92,32 84,24" fill="#FDB8D5" stroke-width="2.2"/>
  </g>
  <g stroke="#DDB05C" stroke-width="1.6" stroke-linecap="round">
    <path d="M44,11 L47,14 M58,7 L60,10.5 M72,10 L70,13.5 M26,27 L30,29 M92,27 L88,29 M60,31 L60,33"/>
  </g>
</g>

<g id="acc-flower">
  <g fill="#A8DB9A" stroke="${INK}" stroke-width="1.6">
    <ellipse cx="38" cy="25" rx="5" ry="2.6" transform="rotate(-40 38 25)"/>
    <ellipse cx="52" cy="16" rx="5" ry="2.6" transform="rotate(-15 52 16)"/>
    <ellipse cx="68" cy="16" rx="5" ry="2.6" transform="rotate(15 68 16)"/>
    <ellipse cx="82" cy="25" rx="5" ry="2.6" transform="rotate(40 82 25)"/>
  </g>
  ${flower(30, 32, "#FDB8D5")}${flower(44, 21, "#D9C2F0")}${flower(60, 16, "#FDB8D5")}${flower(76, 21, "#A9D3EA")}${flower(90, 32, "#D9C2F0")}
</g>

<g id="acc-sailor">
  <g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
    <path d="M42,76 Q60,83 78,76 L60,94 Z" fill="#A9D3EA"/>
    <path d="M41,26 C40,8 80,8 79,26 Z" fill="#fff"/>
    <path d="M40,24 C53,28 67,28 80,24 L80,31 C67,35 53,35 40,31 Z" fill="#A9D3EA"/>
  </g>
  <circle cx="60" cy="79" r="4.2" fill="#F48FB8" stroke="${INK}" stroke-width="2"/>
  <circle cx="60" cy="9" r="3.6" fill="#F48FB8" stroke="${INK}" stroke-width="2"/>
</g>

<g id="acc-crown">
  <path d="M41,30 L39,11 L50.5,19 L60,6 L69.5,19 L81,11 L79,30 C67,33 53,33 41,30 Z" fill="#FFD166" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M42,25 C54,28 66,28 78,25" fill="none" stroke="#E9A93A" stroke-width="2" stroke-linecap="round"/>
  <circle cx="60" cy="21" r="3.2" fill="#F48FB8" stroke="${INK}" stroke-width="1.8"/>
  <g fill="#FFF1C2" stroke="${INK}" stroke-width="1.6">
    <circle cx="39" cy="11" r="2.6"/><circle cx="60" cy="6" r="2.6"/><circle cx="81" cy="11" r="2.6"/>
  </g>
  ${sparkle(12, 30, 0.9)}${sparkle(108, 40, 0.75)}${sparkle(100, 6, 0.6, "#fff")}
</g>

${["plain", "frog", "straw", "flower", "sailor", "crown"].map(v =>
  `<symbol id="duck-${v}" viewBox="-12 -12 144 134" overflow="visible"><use href="#duck-base"/><use href="#${v === "plain" ? "duck-tuft" : "acc-" + v}"/></symbol>`).join("")}

<pattern id="gingham" width="26" height="26" patternUnits="userSpaceOnUse">
  <rect width="26" height="26" fill="#F1F8FC"/>
  <rect width="13" height="26" fill="#CFE7F3" opacity=".55"/>
  <rect width="26" height="13" fill="#CFE7F3" opacity=".55"/>
</pattern>
`;

const DUCKS = [
  { id: "plain", name: "Duckling", tier: "common" },
  { id: "frog", name: "Froggy", tier: "common" },
  { id: "straw", name: "Sunny", tier: "common" },
  { id: "flower", name: "Blossom", tier: "common" },
  { id: "sailor", name: "Sailor", tier: "uncommon" },
  { id: "crown", name: "Royal", tier: "rare" },
];

const DUCK_W = 80, DUCK_H = 80 * 134 / 144;
const duck = (v, cx, cy, rot = 0, w = DUCK_W) => {
  const h = w * 134 / 144;
  return `<use href="#duck-${v}" x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" transform="rotate(${rot} ${cx} ${cy})"/>`;
};

function injectDefs() {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("width", "0"); s.setAttribute("height", "0");
  s.style.position = "absolute";
  s.innerHTML = `<defs>${DEFS}</defs>`;
  document.body.prepend(s);
}

// ---- machine (viewBox "0 -12 400 782") ----
const PILE = [
  ["plain", 184, 534, 8], ["straw", 230, 536, -14], ["flower", 276, 532, 18], ["crown", 322, 538, -10],
  ["sailor", 202, 496, -20], ["plain", 250, 494, 12], ["straw", 300, 500, 26],
  ["frog", 218, 460, 14], ["flower", 266, 462, -12],
  ["plain", 236, 428, 6],
];

function machineSVG() {
  const I = INK;
  const pile = PILE.map(([v, x, y, r]) => duck(v, x, y, r)).join("");
  const cx = 300, hub = 330;
  return `
  <defs>
    <clipPath id="glass-clip"><rect x="60" y="244" width="280" height="318" rx="18"/></clipPath>
    <clipPath id="head-clip"><path id="head-path" d="M22,176 C22,74 104,12 200,12 C296,12 378,74 378,176 C378,194 362,204 342,204 L58,204 C38,204 22,194 22,176 Z"/></clipPath>
    <clipPath id="body-clip"><rect x="34" y="150" width="332" height="592" rx="36"/></clipPath>
  </defs>
  <g stroke="${I}" stroke-width="4" stroke-linejoin="round">
    <ellipse cx="128" cy="748" rx="48" ry="16" fill="#FFB25E"/>
    <ellipse cx="272" cy="748" rx="48" ry="16" fill="#FFB25E"/>
    <path d="M34,330 C6,342 -4,404 12,448 C18,464 26,470 34,474 Z" fill="#fff"/>
    <path d="M366,330 C394,342 404,404 388,448 C382,464 374,470 366,474 Z" fill="#fff"/>
    <rect x="34" y="150" width="332" height="592" rx="36" fill="#fff"/>
  </g>
  <path d="M14,428 C20,434 26,438 34,440 M386,428 C380,434 374,438 366,440" fill="none" stroke="${I}" stroke-width="3" stroke-linecap="round"/>
  <rect x="336" y="200" width="30" height="470" fill="#ECE5F6" clip-path="url(#body-clip)"/>
  <rect x="34" y="150" width="332" height="592" rx="36" fill="none" stroke="${I}" stroke-width="4"/>

  <path d="M34,668 L366,668 L366,706 C366,726 350,742 330,742 L70,742 C50,742 34,726 34,706 Z" fill="#FFE3EE" stroke="${I}" stroke-width="4" stroke-linejoin="round"/>
  <g stroke="${I}" stroke-width="4" stroke-linejoin="round">
    <rect x="72" y="680" width="116" height="48" rx="12" fill="#fff"/>
    <rect x="84" y="688" width="92" height="26" rx="9" fill="#FDB8D5" stroke-width="3"/>
    <rect x="262" y="680" width="70" height="48" rx="12" fill="#fff"/>
  </g>
  <text x="130" y="706" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" stroke="${I}" stroke-width="3" paint-order="stroke" letter-spacing="1">PRIZE</text>
  <rect x="306" y="688" width="9" height="30" rx="4.5" fill="${I}"/>
  <circle cx="284" cy="704" r="10" fill="#FFD166" stroke="${I}" stroke-width="3"/>
  <path d="M284,698 L285.8,702 L290,702.3 L286.8,705 L287.8,709.2 L284,707 L280.2,709.2 L281.2,705 L278,702.3 L282.2,702 Z" fill="#fff"/>
  <path d="M225,694 C225,688 233,688 233,694 C233,688 241,688 241,694 C241,701 233,706 233,708 C233,706 225,701 225,694 Z" fill="#F48FB8" stroke="${I}" stroke-width="2.5" stroke-linejoin="round"/>

  <rect x="48" y="232" width="304" height="342" rx="26" fill="#FFD4E5" stroke="${I}" stroke-width="4"/>
  <rect x="60" y="244" width="280" height="318" rx="18" fill="url(#gingham)"/>
  <g clip-path="url(#glass-clip)">
    <rect x="66" y="254" width="268" height="10" rx="5" fill="#D9C2F0" stroke="${I}" stroke-width="3"/>
    ${pile}
    ${sparkle(330, 512, 1.1)}${sparkle(306, 558, 0.8, "#fff")}
    <rect x="62" y="466" width="90" height="100" rx="6" fill="#fff" fill-opacity=".45" stroke="${I}" stroke-width="3"/>
    <path d="M62,466 L152,466" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
    <path d="M62,466 L152,466" stroke="${I}" stroke-width="3" stroke-linecap="round" fill="none" transform="translate(0 -3)"/>
    <path d="M98,494 L116,494 L107,506 Z" fill="#F48FB8" stroke="${I}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M${cx},268 L${cx},${hub - 14}" stroke="${I}" stroke-width="8" stroke-linecap="round"/>
    <path d="M${cx},268 L${cx},${hub - 14}" stroke="#D9C2F0" stroke-width="3.5" stroke-linecap="round"/>
    <rect x="${cx - 17}" y="249" width="34" height="20" rx="8" fill="#D9C2F0" stroke="${I}" stroke-width="3"/>
    ${duck("frog", cx, 386, -8)}
    ${prong(cx, hub, -1)}${prong(cx, hub, 1)}
    <rect x="${cx - 22}" y="${hub - 16}" width="44" height="30" rx="12" fill="#FDB8D5" stroke="${I}" stroke-width="3"/>
    <path d="M${cx - 6},${hub - 3} C${cx - 6},${hub - 8} ${cx},${hub - 8} ${cx},${hub - 3} C${cx},${hub - 8} ${cx + 6},${hub - 8} ${cx + 6},${hub - 3} C${cx + 6},${hub + 2} ${cx},${hub + 5} ${cx},${hub + 7} C${cx},${hub + 5} ${cx - 6},${hub + 2} ${cx - 6},${hub - 3} Z" fill="#fff"/>
    <path d="M86,322 L126,282 M98,334 L120,312" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".85"/>
  </g>
  <rect x="60" y="244" width="280" height="318" rx="18" fill="none" stroke="${I}" stroke-width="3.5"/>

  <rect x="44" y="586" width="312" height="76" rx="22" fill="#FFD4E5" stroke="${I}" stroke-width="4"/>
  <rect x="60" y="592" width="280" height="7" rx="3.5" fill="#fff" opacity=".75"/>
  <rect x="60" y="604" width="82" height="42" rx="10" fill="${I}"/>
  <text x="101" y="631" text-anchor="middle" font-size="15" font-weight="600" fill="#FFD4E5" letter-spacing=".5">READY!</text>
  <g fill="${I}" opacity=".22"><circle cx="176" cy="629" r="19"/><circle cx="226" cy="629" r="19"/><circle cx="302" cy="629" r="30"/></g>
  <g stroke="${I}" stroke-width="4"><circle cx="176" cy="625" r="19" fill="#D9C2F0"/><circle cx="226" cy="625" r="19" fill="#D9C2F0"/><circle cx="302" cy="624" r="30" fill="#F48FB8"/></g>
  <path d="M180,616 L170,625 L180,634 M222,616 L232,625 L222,634" fill="none" stroke="${I}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <ellipse cx="292" cy="611" rx="12" ry="6" fill="#fff" opacity=".6"/>
  <text x="302" y="630" text-anchor="middle" font-size="16" font-weight="700" fill="#fff" stroke="${I}" stroke-width="3.5" paint-order="stroke" letter-spacing=".5">GRAB</text>

  <use href="#head-path" fill="#fff"/>
  <path d="M378,110 C386,164 364,202 316,206 C354,186 374,152 378,110 Z" fill="#ECE5F6" clip-path="url(#head-clip)"/>
  <use href="#head-path" fill="none" stroke="${I}" stroke-width="4"/>
  <path d="M192,14 C184,-2 200,-8 206,4 M206,12 C212,0 226,2 226,11" fill="none" stroke="${I}" stroke-width="4" stroke-linecap="round"/>
  <ellipse cx="104" cy="140" rx="24" ry="13" fill="#FFB3C6"/>
  <ellipse cx="296" cy="140" rx="24" ry="13" fill="#FFB3C6"/>
  <ellipse cx="146" cy="106" rx="11" ry="14" fill="${I}"/>
  <ellipse cx="254" cy="106" rx="11" ry="14" fill="${I}"/>
  <circle cx="150" cy="100" r="3.6" fill="#fff"/><circle cx="258" cy="100" r="3.6" fill="#fff"/>
  <path d="M166,130 C166,114 234,114 234,130 C234,146 217,154 200,154 C183,154 166,146 166,130 Z" fill="#FFB25E" stroke="${I}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M173,133 Q200,142 227,133" fill="none" stroke="${I}" stroke-width="3" stroke-linecap="round"/>
  <rect x="84" y="186" width="232" height="42" rx="21" fill="#F48FB8" stroke="${I}" stroke-width="4"/>
  <rect x="100" y="192" width="200" height="6" rx="3" fill="#fff" opacity=".45"/>
  <text x="200" y="216" text-anchor="middle" font-size="24" font-weight="700" fill="#fff" stroke="${I}" stroke-width="4.5" paint-order="stroke" letter-spacing="1">QUACK CATCH</text>
  ${sparkle(58, 60, 1.4)}${sparkle(350, 40, 1.1, "#fff")}`;
}

function prong(cx, hub, side) {
  const s = side, I = INK;
  const d = `M${cx + s * 12},${hub + 8} C${cx + s * 30},${hub + 16} ${cx + s * 34},${hub + 34} ${cx + s * 22},${hub + 46}`;
  return `<path d="${d}" fill="none" stroke="${I}" stroke-width="10" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="${cx + s * 22}" cy="${hub + 46}" r="5.5" fill="#FDB8D5" stroke="${I}" stroke-width="3"/>`;
}

// ---- UI icons ----
const ICON = {
  coin: `<svg viewBox="-12 -12 24 24"><circle r="10" fill="#FFD166" stroke="${INK}" stroke-width="2.6"/><path d="M0,-5.5 L1.6,-1.8 L5.4,-1.6 L2.5,0.9 L3.4,4.8 L0,2.8 L-3.4,4.8 L-2.5,0.9 L-5.4,-1.6 L-1.6,-1.8 Z" fill="#fff"/></svg>`,
  ticket: `<svg viewBox="-14 -10 28 20"><path d="M-12,-7 L12,-7 L12,-2.5 C9.5,-2.5 9.5,2.5 12,2.5 L12,7 L-12,7 L-12,2.5 C-9.5,2.5 -9.5,-2.5 -12,-2.5 Z" fill="#FDB8D5" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M4,-5 L4,5" stroke="${INK}" stroke-width="1.8" stroke-dasharray="2 2"/><path d="M-4,-3 C-4,-5 -1.5,-5 -1.5,-3 C-1.5,-5 1,-5 1,-3 C1,-0.5 -1.5,1.5 -1.5,2.5 C-1.5,1.5 -4,-0.5 -4,-3 Z" fill="#fff"/></svg>`,
  home: `<svg viewBox="-12 -12 24 24"><path d="M-8,-1 L0,-8 L8,-1 L8,8 L-8,8 Z" fill="#FDB8D5" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><rect x="-2.6" y="2" width="5.2" height="6" rx="1.5" fill="#fff" stroke="${INK}" stroke-width="2"/></svg>`,
  left: `<svg viewBox="-12 -12 24 24"><path d="M3,-7 L-4,0 L3,7" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  right: `<svg viewBox="-12 -12 24 24"><path d="M-3,-7 L4,0 L-3,7" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  shelf: `<svg viewBox="-12 -12 24 24"><rect x="-9" y="-9" width="18" height="18" rx="3" fill="#fff" stroke="${INK}" stroke-width="2.4"/><path d="M-9,0 L9,0" stroke="${INK}" stroke-width="2.4"/><circle cx="-3.5" cy="-4" r="2.6" fill="#FDB8D5" stroke="${INK}" stroke-width="1.6"/><circle cx="3.5" cy="4.5" r="2.6" fill="#A9D3EA" stroke="${INK}" stroke-width="1.6"/></svg>`,
};

Object.assign(window, { DUCKS, ICON, DEFS, INK });
