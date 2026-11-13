import {
  ArrowRight,
  BellRing,
  BookOpen,
  ClipboardCheck,
  Download,
  FileCheck2,
  Landmark,
  MapPin,
  Route,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import cessLogo from '../../assets/cess-logo.png'
import heroImg from '../../assets/hero-documents.jpg'
import msunLogo from '../../assets/msun-logo.png'
import { useSession } from '../../app/session'
import { homeFor } from '../../app/nav'
import { Logo } from '../../components/Logo'
import { ButtonLink, cn } from '../../components/ui'
import { downloadGeneratedPdf } from '../../content/language'
import { useDb } from '../../data/store'

interface NavItem {
  id: string
  label: string
  shortLabel?: string
  href: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', href: '#' },
  { id: 'how-it-works', label: 'How It Works', href: '#how-it-works' },
  { id: 'documents', label: 'Documents You Can Request', shortLabel: 'Documents', href: '#documents' },
  { id: 'faculty-syllabi', label: 'Faculty & Syllabi', shortLabel: 'Faculty', href: '#faculty-syllabi' },
]

export function HomePage() {
  const { user } = useSession()
  const db = useDb()
  const studentTypes = db.documentTypes.filter((t) => t.audience === 'student')
  const facultyTypes = db.documentTypes.filter((t) => t.audience === 'faculty')
  const primary = user ? { to: homeFor(user.role), label: 'Go to My Dashboard' } : { to: '/sign-in', label: 'Sign In to DocuFlow' }

  const [activeNav, setActiveNav] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const h = window.location.hash.replace('#', '')
      if (['how-it-works', 'documents', 'faculty-syllabi'].includes(h)) return h
    }
    return 'home'
  })

  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({})
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  })

  // Prevent scrollspy from conflicting and shaking indicator during smooth programmatic scroll
  const isClickScrollingRef = useRef(false)
  const scrollTimeoutRef = useRef<number | null>(null)

  const selectNav = (id: string) => {
    setActiveNav(id)
    isClickScrollingRef.current = true
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = window.setTimeout(() => {
      isClickScrollingRef.current = false
    }, 1000)
  }

  useEffect(() => {
    const updateIndicator = () => {
      const el = itemRefs.current[activeNav]
      if (el) {
        setIndicatorStyle({
          left: el.offsetLeft,
          width: el.offsetWidth,
          ready: true,
        })
      }
    }

    updateIndicator()
    const raf = requestAnimationFrame(updateIndicator)
    window.addEventListener('resize', updateIndicator)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', updateIndicator)
    }
  }, [activeNav])

  useEffect(() => {
    const handleScroll = () => {
      // Don't interrupt or shake while smooth scroll is in progress from a click
      if (isClickScrollingRef.current) return

      const scrollY = window.scrollY
      if (scrollY < 180) {
        setActiveNav('home')
        return
      }

      const sections = ['faculty-syllabi', 'documents', 'how-it-works']
      for (const id of sections) {
        const el = document.getElementById(id)
        if (el) {
          const rect = el.getBoundingClientRect()
          if (rect.top <= 240) {
            setActiveNav(id)
            return
          }
        }
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="min-h-dvh bg-white">
      {/* Floating Sticky Top Navigation & Separate Sign In */}
      <div className="fixed top-3 sm:top-5 inset-x-0 z-40 flex items-center justify-center gap-2.5 sm:gap-4 px-3 sm:px-6 pointer-events-none">
        {/* Navigation Bar with Animated Morphing Selection Indicator */}
        <header className="pointer-events-auto flex items-center rounded-full bg-white/95 p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/10 backdrop-blur-md">
          <nav aria-label="Homepage" className="relative flex items-center gap-1 sm:gap-1.5">
            {/* Morphing / Sliding Selection Rounded Rectangle */}
            {indicatorStyle.ready && (
              <span
                className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-[#191970] shadow-sm transition-[transform,width] duration-350 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none"
                style={{
                  transform: `translate3d(${indicatorStyle.left}px, 0, 0)`,
                  width: `${indicatorStyle.width}px`,
                  willChange: 'transform, width',
                }}
                aria-hidden="true"
              />
            )}

            {NAV_ITEMS.map((item) => {
              const isActive = activeNav === item.id
              return (
                <a
                  key={item.id}
                  ref={(el) => {
                    itemRefs.current[item.id] = el
                  }}
                  href={item.href}
                  onClick={(e) => {
                    selectNav(item.id)
                    if (item.id === 'home') {
                      e.preventDefault()
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                      history.replaceState(null, '', ' ')
                    }
                  }}
                  className={cn(
                    'relative z-10 rounded-full px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition-colors duration-200 whitespace-nowrap',
                    isActive
                      ? 'text-white'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100/60',
                  )}
                >
                  <span className={item.shortLabel ? 'hidden sm:inline' : ''}>{item.label}</span>
                  {item.shortLabel && <span className="sm:hidden">{item.shortLabel}</span>}
                </a>
              )
            })}
          </nav>
        </header>

        {/* Separate Sign In White Rectangle */}
        <div className="pointer-events-auto flex items-center">
          <Link
            to={user ? homeFor(user.role) : '/sign-in'}
            className="inline-flex items-center rounded-full bg-white/95 px-5 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-[#191970] shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/10 backdrop-blur-md hover:bg-slate-50 hover:scale-[1.02] active:scale-[0.98] transition-all whitespace-nowrap"
          >
            {user ? 'Dashboard' : 'Sign In'}
          </Link>
        </div>
      </div>

      {/* Hero & Top Navigation */}
      <section className="surface-brand-gradient relative overflow-hidden pb-14 pt-20 sm:pb-20 sm:pt-24 lg:pt-28 text-white">
        {/* Subtle dot matrix grid matching mockup */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(rgba(255,255,255,0.7)_1px,transparent_1px)] [background-size:22px_22px]" aria-hidden />

        {/* Ambient atmospheric glow in institutional midnight blue (#191970) */}
        <div className="pointer-events-none absolute -right-36 -top-36 size-[560px] rounded-full bg-[#191970]/50 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-28 -left-28 size-[520px] rounded-full bg-[#191970]/60 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute right-1/3 top-1/2 size-[420px] -translate-y-1/2 rounded-full bg-[#191970]/40 blur-3xl" aria-hidden />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Centered Brand Emblem */}
          <div className="mx-auto mb-6 sm:mb-8 flex max-w-4xl items-center justify-center gap-3 sm:gap-6 md:gap-8 px-2 text-center">
            <img
              src={msunLogo}
              alt="MSU Naawan Seal"
              className="size-14 sm:size-18 md:size-20 shrink-0 rounded-full drop-shadow-md object-contain"
            />
            <div className="flex flex-col items-center">
              <h1 className="text-2xl sm:text-4xl md:text-[44px] font-black tracking-tight text-white leading-tight">
                CESS <span className="text-[#C4B5FD]">DocuFlow</span>
              </h1>
              <p className="mt-1 text-[10px] sm:text-xs md:text-[13px] font-bold tracking-[0.16em] sm:tracking-[0.18em] text-white/95 uppercase">
                Mindanao State University at Naawan
              </p>
              <p className="mt-0.5 text-xs sm:text-sm md:text-base font-medium text-[#c0b5f5]">
                College of Education and Social Sciences
              </p>
            </div>
            <img
              src={cessLogo}
              alt="CESS Seal"
              className="size-14 sm:size-18 md:size-20 shrink-0 rounded-full drop-shadow-md object-contain"
            />
          </div>

          {/* Subtle separator matching mockup */}
          <div className="mx-auto max-w-6xl border-b border-white/10 mb-8 sm:mb-12" />

          {/* 2-Column Hero Content */}
          <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12 pb-6">
            <div className="space-y-5 text-left">
              <h2 className="font-display text-3xl sm:text-4xl lg:text-[50px] font-bold leading-[1.14] tracking-tight text-white">
                Know where<br />
                your document<br />
                is — without<br />
                <span className="bg-gradient-to-r from-[#DDD2FF] via-[#E4CBFA] to-[#F0C3E2] bg-clip-text text-transparent">
                  visiting the office.
                </span>
              </h2>
              <p className="max-w-xl text-sm sm:text-base lg:text-lg leading-relaxed text-indigo-100/90">
                Submit your document requests online, see which office is handling them right now, and get an email when your document is returned for correction or ready to collect.
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link
                  to="/sign-in"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 sm:px-7 py-3 sm:py-3.5 text-sm sm:text-base font-bold text-[#191970] shadow-lg transition-transform hover:scale-[1.02] hover:bg-slate-50 active:scale-[0.98]"
                >
                  Sign In to DocuFlow
                  <ArrowRight className="size-4 text-[#191970]" />
                </Link>
                {user ? (
                  <Link
                    to={homeFor(user.role)}
                    className="inline-flex items-center rounded-full bg-white/10 px-6 sm:px-7 py-3 sm:py-3.5 text-sm sm:text-base font-semibold text-white ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-white/15"
                  >
                    Go to My Dashboard
                  </Link>
                ) : (
                  <a
                    href="#how-it-works"
                    onClick={() => selectNav('how-it-works')}
                    className="inline-flex items-center rounded-full bg-white/10 px-6 sm:px-7 py-3 sm:py-3.5 text-sm sm:text-base font-semibold text-white ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-white/15"
                  >
                    See How It Works
                  </a>
                )}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
              {/* Outer Glow & Card Container */}
              <div className="relative overflow-hidden rounded-[2.25rem] bg-white p-3 sm:p-4 shadow-2xl ring-1 ring-white/20">
                <img
                  src={heroImg}
                  alt="Illustration of documents travelling along a path between college offices"
                  className="w-full rounded-[1.75rem] object-cover"
                  width={1200}
                  height={900}
                />
              </div>

              {/* Ready to collect badge */}
              <div className="absolute -top-3.5 right-4 sm:-top-4 sm:right-6 z-20 flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-lg ring-1 ring-black/10 animate-float whitespace-nowrap">
                <FileCheck2 className="size-4 shrink-0 text-[#16a34a]" aria-hidden="true" />
                <span className="text-xs sm:text-sm font-bold text-[#15803d]">Ready to collect</span>
              </div>

              {/* Travel Order progress card */}
              <div className="absolute -bottom-6 left-2 sm:-bottom-7 sm:left-4 w-64 sm:w-72 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/5 animate-float [animation-delay:1.5s]">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">TRAVEL ORDER</p>
                <p className="mt-1 text-sm font-bold text-slate-900">Now with the College Dean</p>
                <div className="mt-3 flex gap-1.5" aria-hidden="true">
                  <span className="h-1.5 flex-1 rounded-full bg-[#191970]" />
                  <span className="h-1.5 flex-1 rounded-full bg-[#191970]" />
                  <span className="h-1.5 flex-1 rounded-full bg-[#191970]" />
                  <span className="h-1.5 flex-1 rounded-full bg-slate-200" />
                  <span className="h-1.5 flex-1 rounded-full bg-slate-200" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="relative -mt-12 scroll-mt-20 sm:scroll-mt-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="rounded-3xl bg-white p-6 shadow-raised ring-1 ring-ink-100 sm:p-10">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-600">How it works</p>
              <h2 className="mt-2 text-balance text-2xl font-extrabold text-brand-900 sm:text-3xl">From request to release, in four clear steps</h2>
              <p className="mt-3 text-ink-600">
                DocuFlow follows the College’s existing process. Offices still review and sign your document — DocuFlow simply shows you where it
                is and what happens next.
              </p>
            </div>
            <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Send, title: 'Submit your request', body: 'Choose the document you need, attach the required files, and submit — no paper packet needed.' },
                { icon: ClipboardCheck, title: 'Requirements check', body: 'The College Secretary makes sure nothing is missing. If something is, you’ll be told exactly what to fix.' },
                { icon: Route, title: 'Office reviews', body: 'Your document moves to the Chairperson, the Dean, and any higher office it needs. You can see each step.' },
                { icon: BellRing, title: 'Collect your document', body: 'We email you when it’s ready. Pick up your signed document from the College Secretary.' },
              ].map((s, i) => (
                <li key={s.title} className="group relative rounded-2xl bg-brand-50/60 p-5 ring-1 ring-inset ring-brand-100 transition-all hover:-translate-y-1 hover:bg-white hover:shadow-card">
                  <span className="absolute right-5 top-5 font-display text-3xl font-semibold text-brand-200">{i + 1}</span>
                  <span className="grid size-11 place-items-center rounded-xl bg-brand-600 text-white shadow-brand transition-transform group-hover:scale-110">
                    <s.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-bold text-ink-900">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { icon: Users, title: 'Students and faculty', body: 'Request documents, attach files, follow progress, and fix returned requests — all in one place.' },
            { icon: ShieldCheck, title: 'College Secretary', body: 'Check requirements, record each document once, send it to the right office, and see what’s delayed.' },
            { icon: Landmark, title: 'Reviewing offices', body: 'See documents waiting for you, oldest first, and endorse, approve, or return them with comments.' },
          ].map((c) => (
            <div key={c.title} className="rounded-2xl p-6 ring-1 ring-ink-100 transition-all hover:shadow-card hover:ring-brand-200">
              <c.icon className="size-6 text-brand-600" aria-hidden />
              <h3 className="mt-4 text-lg font-bold text-ink-900">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Document types */}
      <section id="documents" className="scroll-mt-20 sm:scroll-mt-24 bg-brand-50/70 py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-600">Documents you can request</p>
            <h2 className="mt-2 text-2xl font-extrabold text-brand-900 sm:text-3xl">Common requests handled through DocuFlow</h2>
            <p className="mt-3 text-ink-600">After signing in, each request shows the exact files you need and where to get them.</p>
          </div>
          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            {[
              { title: 'For students', items: studentTypes },
              { title: 'For faculty (CESS and IDS)', items: facultyTypes },
            ].map((g) => (
              <div key={g.title} className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-ink-100">
                <h3 className="font-bold text-brand-800">{g.title}</h3>
                <ul className="mt-4 divide-y divide-ink-100">
                  {g.items.map((t) => (
                    <li key={t.id} className="flex items-start gap-3 py-3">
                      <FileCheck2 className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden />
                      <div>
                        <p className="text-sm font-semibold text-ink-900">{t.name}</p>
                        <p className="text-sm text-ink-600">{t.summary}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Faculty, Subject & Syllabus List (REQ-INFO-1..4) */}
      <section id="faculty-syllabi" className="mx-auto max-w-6xl scroll-mt-20 sm:scroll-mt-24 px-5 py-20 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-600">College Directory &amp; Syllabi</p>
          <h2 className="mt-2 text-2xl font-extrabold text-brand-900 sm:text-3xl">
            CESS &amp; IDS Faculty, Subjects, and Course Syllabi
          </h2>
          <p className="mt-3 text-ink-600">
            Browse faculty members across CESS and MSUN-IDS, view their assigned subjects, and download official course syllabi directly.
          </p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {db.faculty.map((fac) => (
            <div key={fac.id} className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-ink-100">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-ink-900">{fac.name}</h3>
                  <p className="mt-0.5 text-xs text-ink-500">{fac.department}</p>
                </div>
              </div>
              <ul className="mt-4 divide-y divide-ink-100">
                {fac.subjects.map((sub) => (
                  <li key={sub.code} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <BookOpen className="size-4 shrink-0 text-brand-500" aria-hidden />
                      <span className="font-mono text-xs font-bold text-brand-800">{sub.code}</span>
                      <span className="text-ink-800">{sub.title}</span>
                    </div>
                    {sub.syllabusFile && (
                      <button
                        type="button"
                        onClick={() =>
                          downloadGeneratedPdf(sub.syllabusFile!, `Course Syllabus — ${sub.code} ${sub.title}`, [
                            `Course Code: ${sub.code}`,
                            `Course Title: ${sub.title}`,
                            `Instructor: ${fac.name}`,
                            `Department: ${fac.department}`,
                          ])
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-100 hover:bg-brand-100"
                      >
                        <Download className="size-3" /> Syllabus PDF
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <div className="surface-brand-gradient relative overflow-hidden rounded-3xl px-8 py-12 text-center sm:px-16 text-white shadow-xl">
          <div className="pointer-events-none absolute -left-20 -top-20 size-72 rounded-full bg-[#191970]/40 blur-2xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-20 -right-20 size-72 rounded-full bg-[#191970]/50 blur-2xl" aria-hidden />
          <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(rgba(255,255,255,0.7)_1px,transparent_1px)] [background-size:22px_22px]" aria-hidden />
          <h2 className="relative text-balance font-display text-3xl font-semibold text-white">Ready to submit or check a request?</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-indigo-100/90">Sign in with your MSU at Naawan email address.</p>
          <div className="relative mt-7 flex justify-center">
            <ButtonLink to={primary.to} size="lg" iconRight={ArrowRight} className="bg-white !text-[#191970] shadow-md hover:!bg-slate-100">
              {primary.label}
            </ButtonLink>
          </div>
        </div>
      </section>

      <footer className="border-t border-ink-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-sm text-ink-600 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <Logo />
            <p className="mt-3 max-w-sm">
              Serving the College of Education and Social Sciences and the MSU at Naawan Integrated Development School (MSUN-IDS).
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="flex items-center gap-2">
              <MapPin className="size-4 text-brand-500" aria-hidden /> Pedro Pagalan St., Poblacion, Naawan, Misamis Oriental 9023
            </p>
            <p className="text-xs text-ink-500">DocuFlow records and tracks documents. Approvals and signatures remain with the designated offices.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
