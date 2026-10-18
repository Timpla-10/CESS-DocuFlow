import {
  ArrowRight,
  BellRing,
  BookOpen,
  ClipboardCheck,
  Download,
  FileCheck2,
  GraduationCap,
  Landmark,
  MapPin,
  Route,
  Send,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import heroImg from '../../assets/hero-documents.jpg'
import { useSession } from '../../app/session'
import { homeFor } from '../../app/nav'
import { Logo } from '../../components/Logo'
import { ButtonLink, DepartmentBadge, buttonClass, cn } from '../../components/ui'
import { downloadGeneratedPdf } from '../../content/language'
import { useDb } from '../../data/store'

export function HomePage() {
  const { user } = useSession()
  const db = useDb()
  const studentTypes = db.documentTypes.filter((t) => t.audience === 'student')
  const facultyTypes = db.documentTypes.filter((t) => t.audience === 'faculty')
  const primary = user ? { to: homeFor(user.role), label: 'Go to My Dashboard' } : { to: '/sign-in', label: 'Sign In to DocuFlow' }

  return (
    <div className="min-h-dvh bg-white">
      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Logo tone="light" />
          <nav aria-label="Homepage" className="flex items-center gap-1 sm:gap-2">
            <a href="#how-it-works" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-brand-100 hover:bg-white/10 hover:text-white sm:inline-block">
              How It Works
            </a>
            <a href="#documents" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-brand-100 hover:bg-white/10 hover:text-white sm:inline-block">
              Documents You Can Request
            </a>
            <a href="#faculty-syllabi" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-brand-100 hover:bg-white/10 hover:text-white sm:inline-block">
              Faculty &amp; Syllabi
            </a>
            <Link to={primary.to} className={buttonClass('on-dark', 'md')}>
              {user ? 'My Dashboard' : 'Sign In'}
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="surface-brand-gradient relative overflow-hidden pb-24 pt-32 sm:pb-32 sm:pt-40">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(var(--color-white)_1px,transparent_1px)] [background-size:22px_22px]" aria-hidden />
        {/* Balanced tri-color ambient glow sources */}
        <div className="pointer-events-none absolute -right-36 -top-36 size-[560px] rounded-full bg-dsee-300/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-28 -left-28 size-[520px] rounded-full bg-ids-400/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute right-1/3 top-1/2 size-[400px] -translate-y-1/2 rounded-full bg-brand-400/20 blur-3xl" aria-hidden />

        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.05fr_1fr]">
          <div className="animate-fade-up">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/12 px-3.5 py-1.5 text-xs font-semibold text-brand-100 ring-1 ring-inset ring-white/20 backdrop-blur">
              <GraduationCap className="size-3.5 text-dsee-200" aria-hidden />
              College of Education and Social Sciences · MSU at Naawan
            </p>
            <h1 className="text-balance font-display text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-[54px]">
              Know where your document is —{' '}
              <span className="bg-gradient-to-r from-brand-100 via-dsee-200 to-ids-200 bg-clip-text text-transparent">
                without visiting the office.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-brand-100/95">
              Submit your document requests online, see which office is handling them right now, and get an email when your document is
              returned for correction or ready to collect.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink to={primary.to} size="lg" iconRight={ArrowRight} className="bg-white !text-brand-800 shadow-raised hover:!bg-brand-50">
                {primary.label}
              </ButtonLink>
              <a href="#how-it-works" className={buttonClass('on-dark', 'lg')}>
                See How It Works
              </a>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-brand-100/90">
              {['Students', 'CESS and IDS faculty', 'College offices'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <UserRoundCheck className="size-4 text-dsee-200" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative animate-fade-up [animation-delay:120ms]">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-dsee-300/30 via-brand-500/15 to-ids-400/25 blur-2xl" aria-hidden />
            <div className="relative overflow-hidden rounded-[1.75rem] bg-white/15 p-2.5 shadow-[0_24px_60px_-15px_rgba(40,14,78,0.4)] ring-1 ring-white/30 backdrop-blur-md">
              <img
                src={heroImg}
                alt="Illustration of documents travelling along a path between college offices, with an email notification along the way"
                className="w-full rounded-[1.35rem] shadow-sm"
                width={1200}
                height={900}
              />
            </div>
            {/* Floating status cards */}
            <div className="absolute -left-6 bottom-10 hidden w-64 animate-float rounded-2xl bg-white/95 p-4 shadow-raised ring-1 ring-ink-100/80 backdrop-blur-md sm:block">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Travel Order</p>
              <p className="mt-1 text-sm font-bold text-ink-900">Now with the College Dean</p>
              <div className="mt-3 flex gap-1" aria-hidden>
                {[1, 1, 1, 0, 0].map((d, i) => (
                  <span key={i} className={cn('h-1.5 flex-1 rounded-full', d ? 'bg-brand-600' : 'bg-brand-100')} />
                ))}
              </div>
            </div>
            <div className="absolute -right-4 top-8 hidden animate-float rounded-2xl bg-white/95 px-4 py-3 shadow-raised ring-1 ring-ink-100/80 backdrop-blur-md [animation-delay:1.5s] sm:block">
              <p className="flex items-center gap-2 text-sm font-bold text-success-700">
                <FileCheck2 className="size-4" aria-hidden /> Ready to collect
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="relative -mt-12 scroll-mt-8">
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
      <section id="documents" className="scroll-mt-8 bg-brand-50/70 py-20">
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
      <section id="faculty-syllabi" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-20 sm:px-8">
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
                </div>
                <DepartmentBadge department={fac.department} />
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
        <div className="surface-brand-gradient relative overflow-hidden rounded-3xl px-8 py-12 text-center sm:px-16">
          <div className="pointer-events-none absolute -left-20 -top-20 size-72 rounded-full bg-brand-500/30 blur-3xl" aria-hidden />
          <h2 className="relative text-balance font-display text-3xl font-semibold text-white">Ready to submit or check a request?</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-brand-100/90">Sign in with your MSU at Naawan email address.</p>
          <div className="relative mt-7 flex justify-center">
            <ButtonLink to={primary.to} size="lg" iconRight={ArrowRight} className="bg-white !text-brand-800 hover:!bg-brand-50">
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
