import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { homeFor } from '../../app/nav'
import { useSession } from '../../app/session'
import { Logo } from '../../components/Logo'
import { ButtonLink, Callout, cn } from '../../components/ui'
import { MESSAGES, ROLE_LABEL, friendlyError } from '../../content/language'
import { DEMO_PASSWORD } from '../../data/seed'
import { api, useDb } from '../../data/store'
import type { Origin, Role } from '../../data/types'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  )
}

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

          {/* Fallback wave gradient matching surface-brand-gradient (Midnight Blue: #191970 -> #111452 -> #0A0B33) */}
          <linearGradient id="cessWaveMain" x1="180" y1="0" x2="640" y2="680" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#191970" />
            <stop offset="50%" stopColor="#111452" />
            <stop offset="100%" stopColor="#0A0B33" />
          </linearGradient>

          {/* Secondary outer wave rim gradient with CESS royal purple glow */}
          <linearGradient id="cessWaveRim" x1="140" y1="0" x2="540" y2="680" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#8E5CCB" stopOpacity="0.65" />
            <stop offset="55%" stopColor="#6E3BBF" stopOpacity="0.52" />
            <stop offset="100%" stopColor="#191970" stopOpacity="0.65" />
          </linearGradient>

          {/* Soft ambient purple glow on the white surface behind the 3D stack */}
          <radialGradient id="ambientWhiteGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#6E3BBF" stopOpacity="0.18" />
            <stop offset="50%" stopColor="#191970" stopOpacity="0.06" />
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

        {/* Primary deep Midnight Blue wave base */}
        <path
          d="M 452 0 C 270 46, 188 158, 186 290 C 184 420, 182 510, 122 590 C 84 640, 36 668, 8 680 L 640 680 L 640 0 Z"
          fill="url(#cessWaveMain)"
        />
      </svg>

      {/* Clipped surface-brand-gradient + 22px dot grid with moving CESS aurora lighting */}
      <div
        className="surface-brand-gradient pointer-events-none absolute inset-0 overflow-hidden"
        style={{ clipPath: 'url(#cessWaveClip)' }}
      >
        <div
          className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(var(--color-white)_1px,transparent_1px)] [background-size:22px_22px]"
        />
        <div className="absolute -bottom-32 -right-32 size-[460px] rounded-full bg-dssh-500/40 blur-2xl animate-aurora-violet" />
        <div className="absolute -top-24 -left-24 size-[400px] rounded-full bg-ids-400/50 blur-2xl animate-aurora-pink" />
        <div className="absolute top-1/3 right-10 size-[360px] rounded-full bg-dsee-300/40 blur-2xl animate-aurora-lavender" />
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
  const rememberId = useId()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  // University Google Workspace Sign-In State
  const [showGoogleModal, setShowGoogleModal] = useState(false)
  const [customGoogleEmail, setCustomGoogleEmail] = useState('')
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [googleBusy, setGoogleBusy] = useState(false)

  // Registration Mode State
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin')
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regIdNumber, setRegIdNumber] = useState('')
  const [regRole, setRegRole] = useState<Role>('student')
  const [regOrigin, setRegOrigin] = useState<'CESS' | 'IDS'>('CESS')
  const [regDept, setRegDept] = useState('BSEd English')
  const [regErrors, setRegErrors] = useState<{ name?: string; email?: string; dept?: string }>({})
  const [roleFocused, setRoleFocused] = useState(false)
  const [originFocused, setOriginFocused] = useState(false)
  const [deptFocused, setDeptFocused] = useState(false)
  const [regBusy, setRegBusy] = useState(false)
  const [regFeedback, setRegFeedback] = useState<{
    type: 'success' | 'pending' | 'error'
    title: string
    message: string
  } | null>(null)

  const fromPath = typeof state.from === 'string' ? state.from : state.from?.pathname

  if (user) return <Navigate to={fromPath ?? homeFor(user.role)} replace />

  const handleGoogleSignIn = async (targetEmail: string) => {
    setGoogleError(null)
    const clean = targetEmail.trim().toLowerCase()
    if (!clean) {
      setGoogleError('Please enter your university Gmail address.')
      return
    }
    if (!/^[^@\s]+@msunaawan\.edu\.ph$/i.test(clean)) {
      setGoogleError('Only official university Gmail accounts (@msunaawan.edu.ph) are accepted.')
      return
    }
    setGoogleBusy(true)
    try {
      const u = await api.signInWithUniversityGoogle(clean)
      signIn(u)
      setShowGoogleModal(false)
      navigate(homeFor(u.role), { replace: true })
    } catch (err) {
      setGoogleError(friendlyError(err))
    } finally {
      setGoogleBusy(false)
    }
  }

  const handleEmailChange = (nextEmail: string) => {
    setEmail(nextEmail)
    if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) {
      next.email = 'Please enter your university Gmail address.'
    } else if (!/^[^@\s]+@msunaawan\.edu\.ph$/i.test(cleanEmail)) {
      next.email = 'Only official university Gmail accounts (@msunaawan.edu.ph) are accepted.'
    }
    if (!password) {
      next.password = 'Please enter your password.'
    }
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      const u = await api.signIn(cleanEmail, password)
      signIn(u)
      navigate(homeFor(u.role), { replace: true })
    } catch (err) {
      setErrors({ form: friendlyError(err) })
    } finally {
      setBusy(false)
    }
  }

  const submitRegister = async (e: FormEvent) => {
    e.preventDefault()
    setRegFeedback(null)
    const errs: { name?: string; email?: string; dept?: string } = {}
    if (!regName.trim()) errs.name = 'Please enter your full name.'
    if (!regEmail.trim()) errs.email = 'Please enter your institutional email.'
    else if (!/^[^@\s]+@msunaawan\.edu\.ph$/i.test(regEmail.trim())) {
      errs.email = 'Email must be an official @msunaawan.edu.ph address.'
    }
    if (!regDept.trim()) errs.dept = 'Please specify your department or degree program.'
    setRegErrors(errs)
    if (Object.keys(errs).length) {
      return
    }

    setRegBusy(true)
    try {
      const res = await api.registerUser({
        name: regName,
        email: regEmail,
        idNumber: regIdNumber,
        requestedRole: regRole,
        department: regDept,
        origin: regOrigin,
      })

      if (res.status === 'activated') {
        setRegFeedback({
          type: 'success',
          title: '🎉 Masterlist Match Confirmed!',
          message: `Your record was verified on the official semester masterlist. Your account has been activated automatically as ${ROLE_LABEL[res.user.role]} (${res.user.department}). You can now sign in!`,
        })
        setEmail(regEmail)
        setPassword(DEMO_PASSWORD)
        setAuthMode('signin')
      } else {
        setRegFeedback({
          type: 'pending',
          title: '⏳ Submitted to College Secretary',
          message: `Your email address is not currently on the pre-loaded semester masterlist. Your registration has been submitted to the College Secretary (Ms. Carmela Ortiz) for manual verification. You will be able to access the system once approved.`,
        })
      }
    } catch (err) {
      setRegFeedback({
        type: 'error',
        title: 'Registration Error',
        message: friendlyError(err),
      })
    } finally {
      setRegBusy(false)
    }
  }

  return (
    <AuthLayout>
      <div className="w-full animate-fade-up">
        {authMode === 'signin' ? (
          <>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#1E1035] sm:text-[30px] sm:leading-tight">
              Welcome to CESS DocuFlow
            </h1>
            <p className="mt-1.5 text-sm font-medium text-[#6B7280]">
              Your documents, one clear path.
            </p>

            {regFeedback && (
              <Callout
                tone={regFeedback.type === 'success' ? 'success' : regFeedback.type === 'pending' ? 'warning' : 'danger'}
                className="mt-5"
                title={regFeedback.title}
              >
                {regFeedback.message}
              </Callout>
            )}

            {state.signedOut && !errors.form && !regFeedback && (
              <Callout tone="success" icon={ShieldCheck} className="mt-5">
                You’ve been signed out securely. Your session has ended.
              </Callout>
            )}
            {errors.form && (
              <Callout tone="danger" className="mt-5" title="We couldn’t sign you in">
                {errors.form.replace(/^We couldn’t sign you in\. /, '')}
              </Callout>
            )}

            {/* University Google Workspace Sign-In Button */}
            <div className="mt-6">
              <button
                type="button"
                onClick={() => {
                  setGoogleError(null)
                  setShowGoogleModal(true)
                }}
                className={cn(
                  'flex h-11 w-full items-center justify-center gap-3 rounded-full border border-purple-200/90 bg-white px-5 text-sm font-semibold text-[#1E1035] shadow-xs transition-all duration-150',
                  'hover:border-purple-300 hover:bg-purple-50/50 hover:shadow-sm active:translate-y-0 cursor-pointer',
                )}
              >
                <GoogleIcon className="size-4 shrink-0" />
                <span>Sign in with University Google Account</span>
              </button>
            </div>

            {/* Visual Divider */}
            <div className="relative my-5 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-purple-200/70" />
              </div>
              <div className="relative bg-[#FAFAFE] px-3 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                Or enter credentials
              </div>
            </div>

            <form onSubmit={submit} noValidate className="space-y-4">
          {/* Field 1: University Gmail Account */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor={emailId} className="block text-xs font-semibold text-[#1E1035]">
                University Gmail Account
              </label>
              <span className="text-[11px] font-medium text-purple-700">@msunaawan.edu.ph only</span>
            </div>
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
                placeholder="username@msunaawan.edu.ph"
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
                    'active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer',
                  )}
                >
                  <span>{busy ? 'Signing in…' : 'Sign In'}</span>
                  {!busy && <ArrowRight className="size-4" aria-hidden="true" />}
                </button>
              </div>

              {/* Toggle to Registration Mode */}
              <div className="mt-5 text-center text-xs text-[#6B7280]">
                First time using CESS DocuFlow?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setRegFeedback(null)
                    setErrors({})
                    setAuthMode('register')
                  }}
                  className="font-bold text-purple-800 hover:text-purple-950 hover:underline cursor-pointer"
                >
                  Register with Institutional Email
                </button>
              </div>
            </form>
          </>
        ) : (
          /* REGISTRATION MODE */
          <>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#1E1035] sm:text-[30px] sm:leading-tight">
              Create University Account
            </h1>
            <p className="mt-1.5 text-sm font-medium text-[#6B7280]">
              Register with your @msunaawan.edu.ph institutional email.
            </p>

            {regFeedback && (
              <Callout
                tone={regFeedback.type === 'success' ? 'success' : regFeedback.type === 'pending' ? 'warning' : 'danger'}
                className="mt-5"
                title={regFeedback.title}
              >
                {regFeedback.message}
              </Callout>
            )}

            <form onSubmit={submitRegister} noValidate className="mt-6 space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1E1035]">Full Name</label>
                <input
                  type="text"
                  value={regName}
                  onChange={(e) => {
                    setRegName(e.target.value)
                    if (regErrors.name) setRegErrors((prev) => ({ ...prev, name: undefined }))
                  }}
                  placeholder="e.g. Maria Clara Santos"
                  required
                  aria-invalid={!!regErrors.name}
                  className={cn(
                    'h-10 w-full rounded-full bg-[#F1ECF9] px-4 text-sm text-[#1E1035] ring-1 ring-inset ring-purple-300/85 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-700 transition-all',
                    regErrors.name && 'bg-danger-50/50 ring-danger-500 focus:ring-danger-500',
                  )}
                />
                {regErrors.name && (
                  <p role="alert" className="mt-1 flex items-center gap-1.5 pl-3 text-xs font-medium text-danger-700">
                    <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                    {regErrors.name}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1E1035]">
                  MSU at Naawan Email (@msunaawan.edu.ph)
                </label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => {
                    setRegEmail(e.target.value)
                    if (regErrors.email) setRegErrors((prev) => ({ ...prev, email: undefined }))
                  }}
                  placeholder="username@msunaawan.edu.ph"
                  required
                  aria-invalid={!!regErrors.email}
                  className={cn(
                    'h-10 w-full rounded-full bg-[#F1ECF9] px-4 text-sm text-[#1E1035] ring-1 ring-inset ring-purple-300/85 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-700 transition-all',
                    regErrors.email && 'bg-danger-50/50 ring-danger-500 focus:ring-danger-500',
                  )}
                />
                {regErrors.email && (
                  <p role="alert" className="mt-1 flex items-center gap-1.5 pl-3 text-xs font-medium text-danger-700">
                    <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                    {regErrors.email}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1E1035]">
                  Student / Employee ID Number
                </label>
                <input
                  type="text"
                  value={regIdNumber}
                  onChange={(e) => setRegIdNumber(e.target.value)}
                  placeholder="e.g. 2024-0012 or EMP-2024-003"
                  className="h-10 w-full rounded-full bg-[#F1ECF9] px-4 text-sm text-[#1E1035] ring-1 ring-inset ring-purple-300/85 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#1E1035]">Role</label>
                  <div className="group relative">
                    <select
                      value={regRole}
                      onChange={(e) => {
                        setRoleFocused(false)
                        e.currentTarget.blur()
                        const nextRole = e.target.value as Role
                        setRegRole(nextRole)
                        if (regOrigin === 'IDS') {
                          setRegDept(nextRole === 'faculty' ? 'Integrated Developmental School' : 'IDS Grade 12 - STEM')
                        } else {
                          setRegDept(nextRole === 'faculty' ? 'Department of Secondary and Elementary Education' : 'BSEd English')
                        }
                      }}
                      onFocus={() => setRoleFocused(true)}
                      onBlur={() => setRoleFocused(false)}
                      className="h-10 w-full appearance-none rounded-full bg-[#F1ECF9] pl-3.5 pr-8 text-xs text-[#1E1035] ring-1 ring-inset ring-purple-300/85 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-700 cursor-pointer"
                    >
                      <option value="student">Student</option>
                      <option value="faculty">Faculty Member</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      <ChevronDown
                        className={cn(
                          'size-3.5 text-purple-700 transform-gpu transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                          !roleFocused && 'group-hover:translate-y-0.5',
                        )}
                        style={{
                          transform: roleFocused ? 'rotate(180deg)' : 'rotate(0deg)',
                          transformOrigin: 'center',
                        }}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#1E1035]">Unit / School</label>
                  <div className="group relative">
                    <select
                      value={regOrigin}
                      onChange={(e) => {
                        setOriginFocused(false)
                        e.currentTarget.blur()
                        const nextOrigin = e.target.value as Origin
                        setRegOrigin(nextOrigin)
                        if (nextOrigin === 'IDS') {
                          setRegDept(regRole === 'faculty' ? 'Integrated Developmental School' : 'IDS Grade 12 - STEM')
                        } else {
                          setRegDept(regRole === 'faculty' ? 'Department of Secondary and Elementary Education' : 'BSEd English')
                        }
                      }}
                      onFocus={() => setOriginFocused(true)}
                      onBlur={() => setOriginFocused(false)}
                      className="h-10 w-full appearance-none rounded-full bg-[#F1ECF9] pl-3.5 pr-8 text-xs text-[#1E1035] ring-1 ring-inset ring-purple-300/85 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-700 cursor-pointer"
                    >
                      <option value="CESS">CESS Main Campus</option>
                      <option value="IDS">IDS Developmental School</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      <ChevronDown
                        className={cn(
                          'size-3.5 text-purple-700 transform-gpu transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                          !originFocused && 'group-hover:translate-y-0.5',
                        )}
                        style={{
                          transform: originFocused ? 'rotate(180deg)' : 'rotate(0deg)',
                          transformOrigin: 'center',
                        }}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1E1035]">Department / Degree Program</label>
                <div className="group relative">
                  <select
                    value={regDept}
                    onChange={(e) => {
                      setDeptFocused(false)
                      e.currentTarget.blur()
                      setRegDept(e.target.value)
                      if (regErrors.dept) setRegErrors((prev) => ({ ...prev, dept: undefined }))
                    }}
                    onFocus={() => setDeptFocused(true)}
                    onBlur={() => setDeptFocused(false)}
                    className={cn(
                      'h-10 w-full appearance-none rounded-full bg-[#F1ECF9] pl-3.5 pr-8 text-xs text-[#1E1035] ring-1 ring-inset ring-purple-300/85 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-700 cursor-pointer transition-all',
                      regErrors.dept && 'bg-danger-50/50 ring-danger-500 focus:ring-danger-500',
                    )}
                  >
                    {regOrigin === 'CESS' ? (
                      regRole === 'faculty' ? (
                        <>
                          <option value="Department of Secondary and Elementary Education">
                            Department of Secondary and Elementary Education (DSEE)
                          </option>
                          <option value="Department of Social Sciences and Humanities">
                            Department of Social Sciences and Humanities (DSSH)
                          </option>
                        </>
                      ) : (
                        <>
                          <option value="BSEd English">BSEd English</option>
                          <option value="BSEd Filipino">BSEd Filipino</option>
                          <option value="BSEd Social Studies">BSEd Social Studies</option>
                          <option value="BSEd Science">BSEd Science</option>
                          <option value="BSEd Mathematics">BSEd Mathematics</option>
                          <option value="BEEd General Curriculum">BEEd General Curriculum</option>
                          <option value="BA Social Sciences">BA Social Sciences</option>
                        </>
                      )
                    ) : regRole === 'faculty' ? (
                      <>
                        <option value="Integrated Developmental School">Integrated Developmental School (IDS Faculty)</option>
                      </>
                    ) : (
                      <>
                        <option value="IDS Grade 12 - STEM">IDS Grade 12 - STEM</option>
                        <option value="IDS Grade 12 - HUMSS">IDS Grade 12 - HUMSS</option>
                        <option value="IDS Grade 12 - TVL / GAS">IDS Grade 12 - TVL / GAS</option>
                        <option value="IDS Grade 11 - Senior High School">IDS Grade 11 - Senior High School</option>
                        <option value="IDS Grade 7-10 - Junior High School">IDS Grade 7-10 - Junior High School</option>
                      </>
                    )}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <ChevronDown
                      className={cn(
                        'size-3.5 text-purple-700 transform-gpu transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                        !deptFocused && 'group-hover:translate-y-0.5',
                      )}
                      style={{
                        transform: deptFocused ? 'rotate(180deg)' : 'rotate(0deg)',
                        transformOrigin: 'center',
                      }}
                      aria-hidden="true"
                    />
                  </div>
                </div>
                {regErrors.dept && (
                  <p role="alert" className="mt-1 flex items-center gap-1.5 pl-3 text-xs font-medium text-danger-700">
                    <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                    {regErrors.dept}
                  </p>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={regBusy}
                  className={cn(
                    'inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-8 text-sm font-bold text-white transition-all duration-200',
                    'bg-gradient-to-r from-[#5B3A99] via-[#4B2E81] to-[#3D246B] shadow-[0_8px_22px_-6px_rgba(91,58,153,0.60)]',
                    'hover:-translate-y-0.5 hover:from-[#4B2E81] hover:to-[#2A174C] hover:shadow-[0_12px_28px_-6px_rgba(42,23,76,0.75)]',
                    'active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer',
                  )}
                >
                  <span>{regBusy ? 'Verifying with Masterlist…' : 'Verify & Register Account'}</span>
                </button>
              </div>

              <div className="mt-4 text-center text-xs text-[#6B7280]">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setRegFeedback(null)
                    setErrors({})
                    setAuthMode('signin')
                  }}
                  className="font-bold text-purple-800 hover:text-purple-950 hover:underline cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          </>
        )}

        {/* Google Workspace University Account Picker Modal */}
        {showGoogleModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="google-modal-title"
          >
            <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-black/10 sm:p-7 animate-scale-in">
              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-purple-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-purple-50 ring-1 ring-purple-200">
                    <GoogleIcon className="size-5" />
                  </div>
                  <div>
                    <h2 id="google-modal-title" className="text-base font-bold text-[#1E1035]">
                      Sign in with Google Workspace
                    </h2>
                    <p className="text-xs text-[#6B7280]">
                      Mindanao State University at Naawan
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGoogleModal(false)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
                  aria-label="Close"
                >
                  <X className="size-5" />
                </button>
              </div>

              {/* Policy Banner */}
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-purple-50/80 px-3.5 py-2.5 text-xs text-purple-900 ring-1 ring-purple-200/80">
                <ShieldCheck className="size-4 shrink-0 text-purple-700" />
                <span>
                  Only official <strong>@msunaawan.edu.ph</strong> university Gmail accounts are authorized.
                </span>
              </div>

              {googleError && (
                <div className="mt-3.5">
                  <Callout tone="danger" title="Unable to sign in">
                    {googleError}
                  </Callout>
                </div>
              )}

              {/* Account List */}
              <div className="mt-4">
                <p className="text-2xs font-bold uppercase tracking-wider text-[#6B7280]">
                  Choose University Account
                </p>
                <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {db.users
                    .filter((u) => u.active)
                    .map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        disabled={googleBusy}
                        onClick={() => handleGoogleSignIn(u.email)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-2xl border border-transparent p-2.5 text-left transition-all cursor-pointer',
                          'hover:border-purple-200 hover:bg-purple-50/70 active:scale-[0.99]',
                          googleBusy && 'opacity-60 cursor-not-allowed',
                        )}
                      >
                        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-purple-700 to-indigo-900 text-xs font-bold text-white shadow-xs">
                          {u.name.slice(0, 1)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-xs font-bold text-[#1E1035]">{u.name}</span>
                            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-800">
                              {ROLE_LABEL[u.role]}
                            </span>
                          </div>
                          <p className="truncate text-[11px] text-[#6B7280]">{u.email}</p>
                        </div>
                      </button>
                    ))}
                </div>
              </div>

              {/* Custom University Email Input */}
              <div className="mt-5 border-t border-purple-100 pt-4">
                <p className="text-2xs font-bold uppercase tracking-wider text-[#6B7280]">
                  Or enter another university account
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleGoogleSignIn(customGoogleEmail)
                  }}
                  className="mt-2 flex gap-2"
                >
                  <input
                    type="email"
                    value={customGoogleEmail}
                    onChange={(e) => setCustomGoogleEmail(e.target.value)}
                    placeholder="name@msunaawan.edu.ph"
                    className="h-10 flex-1 rounded-full bg-[#F1ECF9] px-4 text-xs text-[#1E1035] ring-1 ring-inset ring-purple-300/85 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-700"
                  />
                  <button
                    type="submit"
                    disabled={googleBusy}
                    className="h-10 rounded-full bg-purple-800 px-5 text-xs font-bold text-white transition-all hover:bg-purple-900 disabled:opacity-60 cursor-pointer"
                  >
                    {googleBusy ? 'Signing in…' : 'Continue'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  )
}

function maskEmail(email: string): string {
  const parts = email.split('@')
  if (parts.length !== 2) return email
  const [local, domain] = parts
  if (local.length <= 2) return `${local[0]}****@${domain}`
  return `${local[0]}****${local[local.length - 1]}@${domain}`
}

export function ForgotPasswordPage() {
  const emailId = useId()
  const newPassId = useId()
  const confirmPassId = useId()

  const [step, setStep] = useState<'email' | 'code' | 'new_password' | 'success'>('email')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 6-digit verification code states
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [isCodeIncorrect, setIsCodeIncorrect] = useState(false)
  const [countdown, setCountdown] = useState(59)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // New password states
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  // Countdown timer for code resend
  useEffect(() => {
    if (step !== 'code' || countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [step, countdown])

  // Focus first input on entering code step
  useEffect(() => {
    if (step === 'code') {
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    }
  }, [step])

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) return setError(MESSAGES.requiredField)
    if (!/^[^@\s]+@msunaawan\.edu\.ph$/i.test(cleanEmail)) {
      return setError('Please enter your official university Gmail address (ending with @msunaawan.edu.ph).')
    }

    setBusy(true)
    setError(null)
    try {
      await api.requestPasswordReset(cleanEmail)
      setDigits(['', '', '', '', '', ''])
      setIsCodeIncorrect(false)
      setCountdown(59)
      setStep('code')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDigitChange = (index: number, val: string) => {
    const char = val.replace(/\D/g, '').slice(-1)
    const nextDigits = [...digits]
    nextDigits[index] = char
    setDigits(nextDigits)
    setIsCodeIncorrect(false)

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleDigitKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus()
      } else {
        const nextDigits = [...digits]
        nextDigits[index] = ''
        setDigits(nextDigits)
        setIsCodeIncorrect(false)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!paste) return

    const nextDigits = [...digits]
    for (let i = 0; i < 6; i++) {
      nextDigits[i] = paste[i] || ''
    }
    setDigits(nextDigits)
    setIsCodeIncorrect(false)
    const nextFocusIdx = Math.min(paste.length, 5)
    inputRefs.current[nextFocusIdx]?.focus()
  }

  const handleResend = () => {
    if (countdown > 0) return
    setCountdown(59)
    setIsCodeIncorrect(false)
    setDigits(['', '', '', '', '', ''])
    inputRefs.current[0]?.focus()
  }

  const handleVerifyCode = (e: FormEvent) => {
    e.preventDefault()
    const enteredCode = digits.join('')
    if (enteredCode.length < 6) return

    setBusy(true)
    setTimeout(() => {
      setBusy(false)
      // Demo code: '658485' is the official demo code shown in Figma diagram
      // Any other code triggers the red incorrect code error state
      if (enteredCode === '658485') {
        setIsCodeIncorrect(false)
        setStep('new_password')
      } else {
        setIsCodeIncorrect(true)
      }
    }, 400)
  }

  const handlePasswordSubmit = (e: FormEvent) => {
    e.preventDefault()
    setPasswordError(null)

    if (!newPassword) return setPasswordError('Please enter a new password.')
    if (newPassword.length < 6) return setPasswordError('Password must be at least 6 characters.')
    if (newPassword !== confirmPassword) return setPasswordError('Passwords do not match.')

    setBusy(true)
    setTimeout(() => {
      setBusy(false)
      setStep('success')
    }, 600)
  }

  return (
    <AuthLayout>
      <div className="w-full animate-fade-up">
        {step === 'email' && (
          <>
            <Link
              to="/sign-in"
              className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 hover:text-purple-900 hover:underline"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" /> Back to Sign In
            </Link>

            <span className="grid size-12 place-items-center rounded-2xl bg-purple-50 text-purple-700 ring-1 ring-purple-100">
              <KeyRound className="size-6" aria-hidden="true" />
            </span>
            <h1 className="mt-4 font-display text-2xl font-bold text-[#1E1035]">Reset your password</h1>
            <p className="mt-1.5 text-sm text-[#6B7280]">
              Enter your institutional email and we’ll send you a 6-digit verification code to create a new password.
            </p>

            <form onSubmit={handleEmailSubmit} noValidate className="mt-6 space-y-4">
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
                {busy ? 'Sending code…' : 'Send Verification Code'}
              </button>
            </form>
          </>
        )}

        {step === 'code' && (
          <>
            <button
              type="button"
              onClick={() => {
                setStep('email')
                setIsCodeIncorrect(false)
                setError(null)
              }}
              className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 hover:text-purple-900 hover:underline"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" /> Change Email
            </button>

            <span className="grid size-12 place-items-center rounded-2xl bg-purple-50 text-purple-700 ring-1 ring-purple-100">
              <KeyRound className="size-6" aria-hidden="true" />
            </span>
            <h1 className="mt-4 font-display text-2xl font-bold text-[#1E1035]">Enter verification code</h1>
            <p className="mt-1.5 text-sm text-[#6B7280]">
              We sent a 6-digit verification code to <strong className="text-[#1E1035]">{maskEmail(email)}</strong>
            </p>

            <form onSubmit={handleVerifyCode} noValidate className="mt-6">
              <div>
                <label className="mb-2 block text-xs font-semibold text-[#1E1035]">
                  6-Digit Code
                </label>
                <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                  {digits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        inputRefs.current[idx] = el
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                      onPaste={idx === 0 ? handlePaste : undefined}
                      aria-label={`Digit ${idx + 1}`}
                      className={cn(
                        'size-11 sm:size-12 rounded-xl text-center text-lg sm:text-xl font-bold transition-all duration-150',
                        isCodeIncorrect
                          ? 'border-2 border-danger-500 bg-danger-50/20 text-danger-900 ring-1 ring-danger-500 focus:outline-none focus:ring-2 focus:ring-danger-500'
                          : 'border border-purple-200/90 bg-[#F5F3FA] text-[#1E1035] hover:border-purple-300 focus:border-purple-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600/30',
                      )}
                    />
                  ))}
                </div>

                {isCodeIncorrect && (
                  <p role="alert" className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-danger-700 animate-fade-in">
                    <AlertCircle className="size-4 shrink-0 text-danger-600" aria-hidden="true" />
                    The code you entered is incorrect.
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between text-xs text-[#6B7280]">
                  <span>Didn't get the code?</span>
                  {countdown > 0 ? (
                    <span className="font-medium text-[#6B7280]">
                      Resend in 0:{String(countdown).padStart(2, '0')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResend}
                      className="font-bold text-purple-700 hover:text-purple-900 hover:underline"
                    >
                      Resend
                    </button>
                  )}
                </div>

                <div className="mt-3 rounded-lg bg-purple-50/80 p-2 text-center text-2xs text-purple-700">
                  Demo verification code: <strong className="font-mono text-purple-900">658485</strong> (enter any other code to test the error state)
                </div>
              </div>

              <button
                type="submit"
                disabled={digits.join('').length < 6 || busy}
                aria-busy={busy}
                className={cn(
                  'mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-8 text-sm font-bold text-white transition-all duration-200',
                  'bg-gradient-to-r from-[#7C3AED] to-[#6B21A8] shadow-[0_8px_20px_-6px_rgba(124,58,237,0.65)]',
                  'hover:-translate-y-0.5 hover:from-purple-700 hover:to-purple-800',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {busy ? 'Verifying…' : 'Verify Code'}
              </button>
            </form>
          </>
        )}

        {step === 'new_password' && (
          <>
            <span className="grid size-12 place-items-center rounded-2xl bg-purple-50 text-purple-700 ring-1 ring-purple-100">
              <Lock className="size-6" aria-hidden="true" />
            </span>
            <h1 className="mt-4 font-display text-2xl font-bold text-[#1E1035]">Create new password</h1>
            <p className="mt-1.5 text-sm text-[#6B7280]">
              Enter a secure new password for <strong className="text-[#1E1035]">{email}</strong>
            </p>

            <form onSubmit={handlePasswordSubmit} noValidate className="mt-6 space-y-4">
              <div>
                <label htmlFor={newPassId} className="mb-1.5 block text-xs font-semibold text-[#1E1035]">
                  New Password
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-purple-700/70"
                    aria-hidden="true"
                  />
                  <input
                    id={newPassId}
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="h-11 w-full rounded-full bg-[#F5F3FA] pl-11 pr-11 text-sm text-[#1E1035] ring-1 ring-inset ring-purple-200/80 transition-all placeholder:text-[#6B7280]/75 hover:ring-purple-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#1E1035]"
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor={confirmPassId} className="mb-1.5 block text-xs font-semibold text-[#1E1035]">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-purple-700/70"
                    aria-hidden="true"
                  />
                  <input
                    id={confirmPassId}
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="h-11 w-full rounded-full bg-[#F5F3FA] pl-11 pr-11 text-sm text-[#1E1035] ring-1 ring-inset ring-purple-200/80 transition-all placeholder:text-[#6B7280]/75 hover:ring-purple-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#1E1035]"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {passwordError && (
                <p role="alert" className="flex items-center gap-1.5 pl-3 text-xs font-medium text-danger-700">
                  <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                  {passwordError}
                </p>
              )}

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
                {busy ? 'Updating…' : 'Save New Password'}
              </button>
            </form>
          </>
        )}

        {step === 'success' && (
          <div>
            <span className="grid size-12 place-items-center rounded-2xl bg-success-50 text-success-600 ring-1 ring-success-100">
              <ShieldCheck className="size-6" aria-hidden="true" />
            </span>
            <h1 className="mt-4 font-display text-2xl font-bold text-[#1E1035]">Password reset successful</h1>
            <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
              Your password has been securely updated. You can now sign in with your official university email and your new password.
            </p>
            <ButtonLink to="/sign-in" variant="primary" className="mt-6 w-full justify-center rounded-full">
              Return to Sign In
            </ButtonLink>
          </div>
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
