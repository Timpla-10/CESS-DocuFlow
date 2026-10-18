import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  MailCheck,
  Shield,
  ShieldCheck,
} from 'lucide-react'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { homeFor } from '../../app/nav'
import { useSession } from '../../app/session'
import { Logo } from '../../components/Logo'
import { ButtonLink, Callout, cn } from '../../components/ui'
import { MESSAGES, ROLE_LABEL, friendlyError } from '../../content/language'
import { DEMO_PASSWORD } from '../../data/seed'
import { api, useDb } from '../../data/store'
import type { Role } from '../../data/types'

const PORTAL_OPTIONS: { id: string; label: string; role: Role; origin?: 'CESS' | 'IDS' }[] = [
  { id: 'student', label: ROLE_LABEL.student, role: 'student', origin: 'CESS' },
  { id: 'faculty', label: ROLE_LABEL.faculty, role: 'faculty', origin: 'CESS' },
  { id: 'faculty_ids', label: `${ROLE_LABEL.faculty} (IDS)`, role: 'faculty', origin: 'IDS' },
  { id: 'secretary', label: ROLE_LABEL.secretary, role: 'secretary' },
  { id: 'chairperson', label: ROLE_LABEL.chairperson, role: 'chairperson' },
  { id: 'ids_principal', label: ROLE_LABEL.ids_principal, role: 'ids_principal' },
  { id: 'dean', label: ROLE_LABEL.dean, role: 'dean' },
  { id: 'ovcaa', label: ROLE_LABEL.ovcaa, role: 'ovcaa' },
  { id: 'chancellor', label: ROLE_LABEL.chancellor, role: 'chancellor' },
]

/**
 * Right-panel visual: Smooth purple organic wave (#7C3AED -> #581C87) curving
 * seamlessly into the white card, topped with a multi-layered 3D isometric
 * illustration of academic documents, routing folder, and translucent sheets.
 */
function IsometricDocumentsPanel() {
  return (
    <div className="relative hidden min-h-dvh w-full select-none items-center justify-center lg:flex" aria-hidden="true">
      {/* Underlying Wave Rim & Ambient Glow SVG + ObjectBoundingBox ClipPath */}
      <svg
        viewBox="0 0 640 680"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
      >
        <defs>
          {/* ClipPath matching the exact organic wave contour */}
          <clipPath id="cessWaveClip" clipPathUnits="objectBoundingBox">
            <path d="M 0.706 0 C 0.422 0.068, 0.294 0.232, 0.291 0.426 C 0.288 0.618, 0.284 0.750, 0.191 0.868 C 0.131 0.941, 0.056 0.982, 0.0125 1 L 1 1 L 1 0 Z" />
          </clipPath>

          {/* Fallback wave gradient matching surface-brand-gradient (#48277D -> #371A63 -> #29104F) */}
          <linearGradient id="cessWaveMain" x1="180" y1="0" x2="640" y2="680" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#48277D" />
            <stop offset="50%" stopColor="#371A63" />
            <stop offset="100%" stopColor="#29104F" />
          </linearGradient>

          {/* Secondary outer wave rim gradient */}
          <linearGradient id="cessWaveRim" x1="140" y1="0" x2="540" y2="680" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#6E3BBF" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#48277D" stopOpacity="0.48" />
            <stop offset="100%" stopColor="#371A63" stopOpacity="0.62" />
          </linearGradient>

          {/* Soft ambient purple glow on the white surface behind the 3D stack */}
          <radialGradient id="ambientWhiteGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#5A27A3" stopOpacity="0.18" />
            <stop offset="50%" stopColor="#6D33BF" stopOpacity="0.06" />
            <stop offset="88%" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient lavender glow fading to 0 well inside the SVG bounds */}
        <ellipse cx="250" cy="355" rx="210" ry="195" fill="url(#ambientWhiteGlow)" />

        {/* Secondary translucent purple wave border (matches reference image rim) */}
        <path
          d="M 425 0 C 245 42, 168 152, 166 285 C 164 415, 165 505, 108 585 C 72 636, 26 666, 0 680 L 640 680 L 640 0 Z"
          fill="url(#cessWaveRim)"
        />

        {/* Primary deep purple wave base */}
        <path
          d="M 452 0 C 270 46, 188 158, 186 290 C 184 420, 182 510, 122 590 C 84 640, 36 668, 8 680 L 640 680 L 640 0 Z"
          fill="url(#cessWaveMain)"
        />
      </svg>

      {/* Clipped surface-brand-gradient + 22px dot grid (identical to HomePage / app brand surface) */}
      <div
        className="surface-brand-gradient pointer-events-none absolute inset-0 overflow-hidden"
        style={{ clipPath: 'url(#cessWaveClip)' }}
      >
        <div
          className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(var(--color-white)_1px,transparent_1px)] [background-size:22px_22px]"
        />
        <div className="absolute -bottom-32 -right-32 size-[460px] rounded-full bg-brand-500/25 blur-3xl" />
      </div>

      {/* 3D Isometric Floating Documents Composition (aspect-preserved overlay) */}
      <div className="pointer-events-none relative z-10 flex w-full items-center justify-center px-4">
        <svg
          viewBox="0 0 640 640"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full max-w-[720px] animate-float drop-shadow-[0_28px_44px_rgba(20,8,42,0.45)]"
        >
          <defs>
            {/* Translucent Frosted Glass Sheets (Bottom Layers) */}
            <linearGradient id="frostedSheetDeep" x1="80" y1="460" x2="520" y2="585" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#DDD6FE" stopOpacity="0.42" />
              <stop offset="45%" stopColor="#46207F" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#200E3E" stopOpacity="0.42" />
            </linearGradient>

            <linearGradient id="frostedSheetLow" x1="80" y1="420" x2="520" y2="540" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#DDD6FE" stopOpacity="0.65" />
              <stop offset="45%" stopColor="#5A27A3" stopOpacity="0.40" />
              <stop offset="100%" stopColor="#200E3E" stopOpacity="0.52" />
            </linearGradient>

            <linearGradient id="frostedSheetMid" x1="80" y1="375" x2="520" y2="495" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#C4B5FD" stopOpacity="0.78" />
              <stop offset="48%" stopColor="#46207F" stopOpacity="0.48" />
              <stop offset="100%" stopColor="#200E3E" stopOpacity="0.60" />
            </linearGradient>

            <linearGradient id="frostedSheetTop" x1="80" y1="330" x2="520" y2="450" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.85" />
              <stop offset="50%" stopColor="#5A27A3" stopOpacity="0.58" />
              <stop offset="100%" stopColor="#331860" stopOpacity="0.68" />
            </linearGradient>

            <linearGradient id="frostedEdge" x1="75" y1="320" x2="525" y2="480" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.82" />
              <stop offset="50%" stopColor="#C4B5FD" stopOpacity="0.50" />
              <stop offset="100%" stopColor="#8A57D4" stopOpacity="0.32" />
            </linearGradient>

            {/* Routing Folder Base Gradients */}
            <linearGradient id="folderTopSurface" x1="90" y1="260" x2="520" y2="390" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#F5F3FF" />
              <stop offset="55%" stopColor="#EDE9FE" />
              <stop offset="100%" stopColor="#DDD6FE" />
            </linearGradient>

            <linearGradient id="folderLeftBezel" x1="75" y1="310" x2="275" y2="440" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#C4B5FD" />
              <stop offset="100%" stopColor="#6D33BF" />
            </linearGradient>

            <linearGradient id="folderRightBezel" x1="275" y1="435" x2="530" y2="290" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#46207F" stopOpacity="0.88" />
              <stop offset="100%" stopColor="#8A57D4" stopOpacity="0.92" />
            </linearGradient>

            <linearGradient id="folderInnerWell" x1="120" y1="270" x2="460" y2="360" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#331860" stopOpacity="0.88" />
              <stop offset="55%" stopColor="#5A27A3" stopOpacity="0.76" />
              <stop offset="100%" stopColor="#A882E2" stopOpacity="0.88" />
            </linearGradient>

            {/* Colored Middle Accent Sheets (Lavender-Orchid & Warm Amber) */}
            <linearGradient id="orchidSheet" x1="160" y1="230" x2="520" y2="310" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#E9D5FF" />
              <stop offset="45%" stopColor="#A882E2" />
              <stop offset="100%" stopColor="#6D33BF" />
            </linearGradient>

            <linearGradient id="amberSheet" x1="150" y1="200" x2="515" y2="275" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="50%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>

            {/* Top Primary Isometric Document Sheet */}
            <linearGradient id="mainDocSurface" x1="75" y1="160" x2="520" y2="350" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="60%" stopColor="#FAF5FF" />
              <stop offset="100%" stopColor="#EDE9FE" />
            </linearGradient>

            <linearGradient id="mainDocShine" x1="180" y1="140" x2="360" y2="340" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
              <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.55" />
              <stop offset="50%" stopColor="#F3E8FF" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#EDE9FE" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="mainDocEdgeLeft" x1="70" y1="275" x2="280" y2="375" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#DDD6FE" />
              <stop offset="100%" stopColor="#A78BFA" />
            </linearGradient>

            <linearGradient id="mainDocEdgeRight" x1="280" y1="375" x2="535" y2="215" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#A78BFA" />
              <stop offset="100%" stopColor="#DDD6FE" />
            </linearGradient>

            {/* Official Seal / Stamp Gradient */}
            <linearGradient id="goldSeal" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>

            <linearGradient id="purpleBadge" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#5A27A3" />
              <stop offset="100%" stopColor="#331860" />
            </linearGradient>
          </defs>

          {/* ==============================================================
              1. FOUR TRANSLUCENT FROSTED-GLASS SHEETS (Isometric Stack)
             ============================================================== */}
          {/* Frosted Sheet 4 (Deepest wireframe glass plane) */}
          <polygon
            points="82,486 322,348 512,458 272,596"
            fill="url(#frostedSheetDeep)"
            stroke="url(#frostedEdge)"
            strokeWidth="1"
          />

          {/* Frosted Sheet 3 (Lower glass plane) */}
          <polygon
            points="82,442 322,304 512,414 272,552"
            fill="url(#frostedSheetLow)"
            stroke="url(#frostedEdge)"
            strokeWidth="1.2"
          />

          {/* Frosted Sheet 2 (Middle glass plane - with subtle routing flow path) */}
          <polygon
            points="82,398 322,260 512,370 272,508"
            fill="url(#frostedSheetMid)"
            stroke="url(#frostedEdge)"
            strokeWidth="1.4"
          />
          {/* Isometric routing path lines on middle frosted glass */}
          <polyline
            points="156,396 248,343 318,383 412,329"
            stroke="#EDE9FE"
            strokeOpacity="0.6"
            strokeWidth="2"
            strokeDasharray="5 5"
            strokeLinecap="round"
          />
          <circle cx="156" cy="396" r="4" fill="#FDE68A" fillOpacity="0.9" />
          <circle cx="248" cy="343" r="4" fill="#DDD6FE" fillOpacity="0.9" />
          <circle cx="318" cy="383" r="4" fill="#FDE68A" fillOpacity="0.9" />

          {/* Frosted Sheet 1 (Upper translucent glass) */}
          <polygon
            points="82,354 322,216 512,326 272,464"
            fill="url(#frostedSheetTop)"
            stroke="url(#frostedEdge)"
            strokeWidth="1.5"
          />

          {/* ==============================================================
              2. ISOMETRIC 3D ROUTING PORTFOLIO / DOCUMENT TRAY BASE
             ============================================================== */}
          {/* Extruded Left 3D Thickness Wall */}
          <path
            d="M 76 312 L 274 426 L 274 442 L 76 328 Z"
            fill="url(#folderLeftBezel)"
          />
          {/* Extruded Right 3D Thickness Wall */}
          <path
            d="M 274 426 L 528 280 L 528 296 L 274 442 Z"
            fill="url(#folderRightBezel)"
          />
          {/* Routing Tray Side Status Indicators (Isometric slots on left bezel) */}
          <polygon points="98,329 108,335 108,340 98,334" fill="#4C1D95" fillOpacity="0.75" />
          <polygon points="116,339 132,348 132,353 116,344" fill="#581C87" fillOpacity="0.75" />
          <polygon points="140,353 156,362 156,367 140,358" fill="#6D28D9" fillOpacity="0.75" />

          {/* Top Surface of the 3D Routing Folder Base */}
          <polygon
            points="76,312 330,166 528,280 274,426"
            fill="url(#folderTopSurface)"
            stroke="#EDE9FE"
            strokeWidth="1.5"
          />

          {/* Recessed Document Well & Routing Matrix inside the Base Tray */}
          <polygon
            points="106,308 326,182 478,270 258,396"
            fill="url(#folderInnerWell)"
          />
          {/* Isometric Routing Matrix Grid Cells (Representing Office Checkpoints) */}
          <g opacity="0.68">
            <polygon points="130,305 162,287 182,299 150,317" fill="#EDE9FE" />
            <polygon points="170,282 202,264 222,276 190,294" fill="#EDE9FE" />
            <polygon points="210,259 242,241 262,253 230,271" fill="#DDD6FE" />
            <polygon points="158,322 190,304 210,316 178,334" fill="#DDD6FE" />
            <polygon points="198,299 230,281 250,293 218,311" fill="#C4B5FD" />
            <polygon points="238,276 270,258 290,270 258,288" fill="#C4B5FD" />
          </g>
          {/* Highlighted Stamp Pad on the right side of the folder tray */}
          <polygon
            points="318,342 386,303 420,322 352,361"
            fill="#C4B5FD"
            fillOpacity="0.72"
          />

          {/* ==============================================================
              3. LAYERED COLORED ACCENT SHEETS (Orchid & Warm Amber)
             ============================================================== */}
          {/* Sheet A: Soft Orchid/Lavender Endorsement Sheet */}
          <g>
            <path d="M 272 396 L 520 258 L 520 264 L 272 402 Z" fill="#A855F7" />
            <polygon
              points="86,304 334,166 520,258 272,396"
              fill="url(#orchidSheet)"
            />
            <line x1="350" y1="242" x2="468" y2="300" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="330" y1="255" x2="448" y2="313" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="2.5" strokeLinecap="round" />
          </g>

          {/* Sheet B: Warm Amber/Gold Academic Clearance Sheet */}
          <g>
            <path d="M 276 380 L 516 236 L 516 242 L 276 386 Z" fill="#D97706" />
            <polygon
              points="84,296 332,152 516,236 276,380"
              fill="url(#amberSheet)"
            />
            {/* Index tab on the amber clearance sheet */}
            <polygon points="448,205 478,188 504,200 474,217" fill="#FBBF24" stroke="#FEF3C7" strokeWidth="1" />
            <line x1="345" y1="215" x2="462" y2="269" stroke="#FEF3C7" strokeOpacity="0.8" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="322" y1="229" x2="438" y2="283" stroke="#FEF3C7" strokeOpacity="0.65" strokeWidth="2.5" strokeLinecap="round" />
          </g>

          {/* ==============================================================
              4. PRIMARY 3D ISOMETRIC ACADEMIC DOCUMENT SHEET (Top Layer)
             ============================================================== */}
          <g>
            {/* Soft shadow cast by top sheet onto colored sheets below */}
            <polygon
              points="82,292 338,144 522,226 278,374"
              fill="#3B0764"
              fillOpacity="0.16"
            />

            {/* 3D Paper Thickness — Front-Left Edge */}
            <path
              d="M 74 280 L 278 362 L 278 371 L 74 289 Z"
              fill="url(#mainDocEdgeLeft)"
            />
            {/* 3D Paper Thickness — Front-Right Edge */}
            <path
              d="M 278 362 L 534 206 L 534 215 L 278 371 Z"
              fill="url(#mainDocEdgeRight)"
            />

            {/* Main Crisp White/Lavender Isometric Document Surface */}
            <polygon
              points="74,280 330,124 534,206 278,362"
              fill="url(#mainDocSurface)"
              stroke="#FFFFFF"
              strokeWidth="2"
            />

            {/* Glossy Diagonal Specular Reflection (Matches Reference Image Sheen) */}
            <polygon
              points="74,280 330,124 415,158 212,335"
              fill="url(#mainDocShine)"
            />

            {/* ---- Isometric Document Content (Aligned to 30° Axes) ---- */}

            {/* 1. Institutional Header Emblem & Document Title Block */}
            <polygon
              points="296,166 332,144 364,157 328,179"
              fill="url(#purpleBadge)"
            />
            <polyline
              points="320,163 328,167 343,156"
              stroke="#FDE68A"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Header Title & Control Number Bars */}
            <line x1="354" y1="168" x2="438" y2="202" stroke="#4C1D95" strokeWidth="6" strokeLinecap="round" />
            <line x1="338" y1="178" x2="402" y2="204" stroke="#A78BFA" strokeWidth="4" strokeLinecap="round" />
            {/* Control Number Pill on Top-Right of Document */}
            <polygon points="444,196 472,179 498,190 470,207" fill="#F3E8FF" stroke="#C4B5FD" strokeWidth="1" />

            {/* Subtle Divider Rule under Header */}
            <line x1="268" y1="186" x2="462" y2="264" stroke="#E9D5FF" strokeWidth="2" strokeLinecap="round" />

            {/* 2. Isometric Routing Checkboxes & Printed Document Lines */}
            {/* Row 1: Verified Requirement (Checkmark + Text Lines) */}
            <polygon points="240,202 258,191 274,198 256,209" fill="#EDE9FE" stroke="#8B5CF6" strokeWidth="1.5" />
            <polyline points="251,201 256,204 266,196" stroke="#6D28D9" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="282" y1="204" x2="412" y2="256" stroke="#6D28D9" strokeOpacity="0.45" strokeWidth="4.5" strokeLinecap="round" />
            <line x1="268" y1="212" x2="368" y2="252" stroke="#C4B5FD" strokeWidth="3.5" strokeLinecap="round" />

            {/* Row 2: Endorsed by Chairperson (Checkmark + Text Lines) */}
            <polygon points="196,229 214,218 230,225 212,236" fill="#EDE9FE" stroke="#8B5CF6" strokeWidth="1.5" />
            <polyline points="207,228 212,231 222,223" stroke="#6D28D9" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="238" y1="231" x2="366" y2="282" stroke="#6D28D9" strokeOpacity="0.45" strokeWidth="4.5" strokeLinecap="round" />
            <line x1="224" y1="239" x2="332" y2="282" stroke="#C4B5FD" strokeWidth="3.5" strokeLinecap="round" />

            {/* Row 3: College Dean Approval (Checkmark + Text Lines) */}
            <polygon points="152,256 170,245 186,252 168,263" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1.5" />
            <polyline points="163,255 168,258 178,250" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="194" y1="258" x2="302" y2="301" stroke="#6D28D9" strokeOpacity="0.45" strokeWidth="4.5" strokeLinecap="round" />
            <line x1="180" y1="266" x2="264" y2="300" stroke="#C4B5FD" strokeWidth="3.5" strokeLinecap="round" />

            {/* 3. Isometric Signatory Block (Bottom-Left of Sheet) */}
            <path
              d="M 142 284 C 154 276, 162 288, 174 280 C 182 275, 190 286, 202 282"
              stroke="#6D28D9"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
            <line x1="132" y1="286" x2="212" y2="318" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
            <line x1="122" y1="293" x2="182" y2="317" stroke="#DDD6FE" strokeWidth="3" strokeLinecap="round" />

            {/* 4. Official Institutional Seal / Stamp Accent (Lower Corner) */}
            <g transform="translate(310, 304) rotate(-28) scale(1, 0.62)">
              <polygon points="-10,22 -18,44 -8,38 -2,46 4,24" fill="#7C3AED" />
              <polygon points="6,22 14,44 20,36 28,42 18,20" fill="#6D28D9" />
              <circle cx="4" cy="4" r="24" fill="url(#goldSeal)" stroke="#FEF3C7" strokeWidth="2" />
              <circle cx="4" cy="4" r="16" fill="#581C87" stroke="#FDE68A" strokeWidth="1.5" strokeDasharray="3 2" />
              <polyline points="-3,4 2,9 12,-2" stroke="#FEF3C7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </g>

          {/* ==============================================================
              5. FLOATING MINI ROUTING STATUS CARD (Top-Left Hover Accent)
             ============================================================== */}
          <g>
            <polygon points="136,192 222,140 278,164 192,216" fill="#4C1D95" fillOpacity="0.12" />
            <path d="M 126 174 L 182 198 L 182 203 L 126 179 Z" fill="#DDD6FE" />
            <path d="M 182 198 L 268 146 L 268 151 L 182 203 Z" fill="#C4B5FD" />
            <polygon
              points="126,174 212,122 268,146 182,198"
              fill="#FFFFFF"
              fillOpacity="0.94"
              stroke="#EDE9FE"
              strokeWidth="1.5"
            />
            <polygon points="196,138 210,130 222,135 208,143" fill="#7C3AED" />
            <line x1="162" y1="164" x2="202" y2="140" stroke="#6D28D9" strokeWidth="4" strokeLinecap="round" />
            <line x1="174" y1="170" x2="226" y2="139" stroke="#C4B5FD" strokeWidth="3" strokeLinecap="round" />
            <line x1="186" y1="176" x2="232" y2="149" stroke="#E9D5FF" strokeWidth="3" strokeLinecap="round" />
          </g>
        </svg>
      </div>
    </div>
  )
}

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative grid min-h-dvh w-full overflow-hidden bg-[#F4F0FA] lg:grid-cols-[1.08fr_1.07fr]">
      {/* Top-Left: Back to Landing Page Button */}
      <div className=" z-20 px-4 pt-5 sm:px-8 sm:pt-7 lg:absolute lg:left-8 lg:top-7 lg:p-0">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs font-bold text-[#331860] shadow-xs ring-1 ring-purple-200/90 backdrop-blur transition-all hover:-translate-y-px hover:bg-white hover:text-[#200E3E] hover:shadow-card hover:ring-purple-300"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          <span>Back to Landing Page</span>
        </Link>
      </div>

      {/* Left Side: Enclosed Rectangle Card shifted toward the right with generous side padding */}
      <div className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-8 sm:px-8 lg:justify-end lg:pl-10 lg:pr-4 xl:pr-10">
        <div className="flex w-full max-w-[540px] flex-col justify-between rounded-3xl bg-white px-8 py-9 shadow-[0_24px_60px_-12px_rgba(46,16,101,0.22)] ring-1 ring-purple-300/75 sm:px-14 sm:py-11">
          {/* Top-Left: CESS DocuFlow Brand Mark / Emblem */}
          <div>
            <Link
              to="/"
              className="inline-flex items-center rounded-xl transition-opacity hover:opacity-90"
              aria-label="CESS DocuFlow home"
            >
              <Logo />
            </Link>
          </div>

          {/* Center Form Content */}
          <div className="my-7 w-full">{children}</div>

          {/* Academic Institutional Footer */}
          <p className="border-t border-purple-200/70 pt-5 text-xs font-medium text-[#6B7280]">
            College of Education and Social Sciences · MSU at Naawan
          </p>
        </div>
      </div>

      {/* Right Side (~50% width): Full-Height Organic Purple Wave & 3D Floating Documents */}
      <IsometricDocumentsPanel />
    </main>
  )
}

export function SignInPage() {
  const { user, signIn } = useSession()
  const db = useDb()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as { from?: string | { pathname?: string }; signedOut?: boolean }

  const emailId = useId()
  const passwordId = useId()
  const roleId = useId()
  const rememberId = useId()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [portalId, setPortalId] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  const fromPath = typeof state.from === 'string' ? state.from : state.from?.pathname

  if (user) return <Navigate to={fromPath ?? homeFor(user.role)} replace />

  const handleRoleChange = (selectedId: string) => {
    setPortalId(selectedId)
    const option = PORTAL_OPTIONS.find((o) => o.id === selectedId)
    if (option) {
      const account = db.users.find(
        (u) => u.role === option.role && u.active && (!option.origin || u.origin === option.origin),
      )
      if (account) {
        setEmail(account.email)
        setPassword(DEMO_PASSWORD)
        setErrors({})
      }
    }
  }

  const handleEmailChange = (nextEmail: string) => {
    setEmail(nextEmail)
    const matched = db.users.find((u) => u.email.toLowerCase() === nextEmail.trim().toLowerCase())
    if (matched) {
      const option = PORTAL_OPTIONS.find(
        (o) => o.role === matched.role && (!o.origin || o.origin === matched.origin),
      )
      if (option) setPortalId(option.id)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!email.trim()) next.email = 'Please enter your institutional email address.'
    if (!password) next.password = 'Please enter your password.'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      const selectedOption = PORTAL_OPTIONS.find((o) => o.id === portalId)
      const u = await api.signIn(email, password, selectedOption?.role)
      signIn(u)
      navigate(fromPath ?? homeFor(u.role), { replace: true })
    } catch (err) {
      setErrors({ form: friendlyError(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <div className="w-full animate-fade-up">
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#1E1035] sm:text-[30px] sm:leading-tight">
          Welcome to CESS DocuFlow
        </h1>
        <p className="mt-1.5 text-sm font-medium text-[#6B7280]">
          Your documents, one clear path.
        </p>

        {state.signedOut && !errors.form && (
          <Callout tone="success" icon={ShieldCheck} className="mt-5">
            You’ve signed out. See you next time!
          </Callout>
        )}
        {errors.form && (
          <Callout tone="danger" className="mt-5" title="We couldn’t sign you in">
            {errors.form.replace(/^We couldn’t sign you in\. /, '')}
          </Callout>
        )}

        <form onSubmit={submit} noValidate className="mt-7 space-y-4">
          {/* Field 1: Institutional Email */}
          <div>
            <label htmlFor={emailId} className="mb-1.5 block text-xs font-semibold text-[#1E1035]">
              Institutional Email
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-purple-800/80"
                aria-hidden="true"
              />
              <input
                id={emailId}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                placeholder="Enter your institutional email"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? `${emailId}-error` : undefined}
                className={cn(
                  'h-11 w-full rounded-full bg-[#F1ECF9] pl-11 pr-4 text-sm text-[#1E1035] ring-1 ring-inset ring-purple-300/85 transition-all',
                  'placeholder:text-[#6B7280]/75 hover:ring-purple-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-700',
                  errors.email && 'bg-danger-50/50 ring-danger-500 focus:ring-danger-500',
                )}
              />
            </div>
            {errors.email && (
              <p id={`${emailId}-error`} role="alert" className="mt-1.5 flex items-center gap-1.5 pl-3 text-xs font-medium text-danger-700">
                <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                {errors.email}
              </p>
            )}
          </div>

          {/* Field 2: Password */}
          <div>
            <label htmlFor={passwordId} className="mb-1.5 block text-xs font-semibold text-[#1E1035]">
              Password
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-purple-800/80"
                aria-hidden="true"
              />
              <input
                id={passwordId}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? `${passwordId}-error` : undefined}
                className={cn(
                  'h-11 w-full rounded-full bg-[#F1ECF9] pl-11 pr-11 text-sm text-[#1E1035] ring-1 ring-inset ring-purple-300/85 transition-all',
                  'placeholder:text-[#6B7280]/75 hover:ring-purple-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-700',
                  errors.password && 'bg-danger-50/50 ring-danger-500 focus:ring-danger-500',
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-[#6B7280] transition-colors hover:bg-purple-200/60 hover:text-purple-900"
              >
                {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
              </button>
            </div>
            {errors.password && (
              <p id={`${passwordId}-error`} role="alert" className="mt-1.5 flex items-center gap-1.5 pl-3 text-xs font-medium text-danger-700">
                <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                {errors.password}
              </p>
            )}
          </div>

          {/* Field 3 (Optional): Role / Portal */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor={roleId} className="text-xs font-semibold text-[#1E1035]">
                Role / Portal
              </label>
              <span className="text-[11px] font-medium text-[#6B7280]">Optional</span>
            </div>
            <div className="relative">
              <Shield
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-purple-800/80"
                aria-hidden="true"
              />
              <select
                id={roleId}
                value={portalId}
                onChange={(e) => handleRoleChange(e.target.value)}
                className={cn(
                  'h-11 w-full appearance-none rounded-full bg-[#F1ECF9] pl-11 pr-10 text-sm ring-1 ring-inset ring-purple-300/85 transition-all',
                  'hover:ring-purple-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-700',
                  portalId ? 'text-[#1E1035]' : 'text-[#6B7280]',
                  'bg-[length:16px] bg-[right_0.9rem_center] bg-no-repeat',
                  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23581C87' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
                )}
              >
                <option value="">Select role portal to autofill…</option>
                {PORTAL_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id} className="text-[#1E1035]">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Controls & Links: Remember me + Forgot Password? */}
          <div className="flex items-center justify-between pt-0.5 text-xs">
            <label htmlFor={rememberId} className="inline-flex cursor-pointer items-center gap-2 text-[#6B7280] select-none hover:text-[#1E1035]">
              <input
                id={rememberId}
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="size-3.5 cursor-pointer rounded border-purple-400 accent-purple-800"
              />
              <span className="font-medium">Remember me</span>
            </label>
            <Link
              to="/forgot-password"
              className="font-semibold text-purple-800 transition-colors hover:text-purple-950 hover:underline"
            >
              Forgot Password?
            </Link>
          </div>

          {/* Primary Sign In Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className={cn(
                'inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-8 text-sm font-bold text-white transition-all duration-200',
                'bg-gradient-to-r from-[#5B3A99] via-[#4B2E81] to-[#3D246B] shadow-[0_8px_22px_-6px_rgba(91,58,153,0.60)]',
                'hover:-translate-y-0.5 hover:from-[#4B2E81] hover:to-[#2A174C] hover:shadow-[0_12px_28px_-6px_rgba(42,23,76,0.75)]',
                'active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              <span>{busy ? 'Signing in…' : 'Sign In'}</span>
              {!busy && <ArrowRight className="size-4" aria-hidden="true" />}
            </button>
          </div>
        </form>
      </div>
    </AuthLayout>
  )
}

export function ForgotPasswordPage() {
  const emailId = useId()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return setError(MESSAGES.requiredField)
    setBusy(true)
    setError(null)
    try {
      await api.requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <div className="w-full animate-fade-up">
        <Link
          to="/sign-in"
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 hover:text-purple-900 hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" /> Back to Sign In
        </Link>
        {sent ? (
          <div>
            <span className="grid size-12 place-items-center rounded-2xl bg-success-50 text-success-600 ring-1 ring-success-100">
              <MailCheck className="size-6" aria-hidden="true" />
            </span>
            <h1 className="mt-4 font-display text-2xl font-bold text-[#1E1035]">Check your email</h1>
            <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
              If <strong className="text-[#1E1035]">{email}</strong> belongs to a CESS DocuFlow account, we’ve sent a link to set a new
              password. Please also check your spam folder.
            </p>
            <ButtonLink to="/sign-in" variant="secondary" className="mt-6 rounded-full">
              Return to Sign In
            </ButtonLink>
          </div>
        ) : (
          <>
            <span className="grid size-12 place-items-center rounded-2xl bg-purple-50 text-purple-700 ring-1 ring-purple-100">
              <KeyRound className="size-6" aria-hidden="true" />
            </span>
            <h1 className="mt-4 font-display text-2xl font-bold text-[#1E1035]">Reset your password</h1>
            <p className="mt-1.5 text-sm text-[#6B7280]">
              Enter your institutional email and we’ll send you a link to create a new password.
            </p>
            <form onSubmit={submit} noValidate className="mt-6 space-y-4">
              <div>
                <label htmlFor={emailId} className="mb-1.5 block text-xs font-semibold text-[#1E1035]">
                  Institutional Email
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-purple-700/70"
                    aria-hidden="true"
                  />
                  <input
                    id={emailId}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your institutional email"
                    aria-invalid={!!error}
                    className={cn(
                      'h-11 w-full rounded-full bg-[#F5F3FA] pl-11 pr-4 text-sm text-[#1E1035] ring-1 ring-inset ring-purple-200/80 transition-all',
                      'placeholder:text-[#6B7280]/75 hover:ring-purple-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600',
                      error && 'bg-danger-50/50 ring-danger-500 focus:ring-danger-500',
                    )}
                  />
                </div>
                {error && (
                  <p role="alert" className="mt-1.5 flex items-center gap-1.5 pl-3 text-xs font-medium text-danger-700">
                    <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                    {error}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={busy}
                aria-busy={busy}
                className={cn(
                  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-8 text-sm font-bold text-white transition-all duration-200',
                  'bg-gradient-to-r from-[#7C3AED] to-[#6B21A8] shadow-[0_8px_20px_-6px_rgba(124,58,237,0.65)]',
                  'hover:-translate-y-0.5 hover:from-purple-700 hover:to-purple-800',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                {busy ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          </>
        )}
      </div>
    </AuthLayout>
  )
}

export function SessionExpiredPage() {
  return (
    <AuthLayout>
      <div className="w-full animate-fade-up">
        <span className="grid size-12 place-items-center rounded-2xl bg-warning-50 text-warning-600 ring-1 ring-warning-100">
          <Clock className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold text-[#1E1035]">
          You were signed out to keep your account safe
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
          We sign you out after 30 minutes without activity. Anything you already submitted has been saved. Please sign in again to continue.
        </p>
        <ButtonLink to="/sign-in" size="lg" className="mt-6 rounded-full" iconRight={ArrowRight}>
          Sign In Again
        </ButtonLink>
      </div>
    </AuthLayout>
  )
}
