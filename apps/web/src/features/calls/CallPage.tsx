import { ArrowLeft, Lock } from 'lucide-react'
import { Link, useParams } from 'react-router'
import Container from '@/components/site/Container'
import { Address, DemoNote, Panel, Row, Signed, StateTag } from '@/components/ui'
import { date, duration, mon, price, shortAddress, tokens } from '@/lib/format'
import { source } from '@/lib/data'
import { useLoad, useNow, useTitle } from '@/lib/hooks'
import { averageBps, entryPrice, returnBps } from '@/lib/types'
import { recordLine } from './components/CallCard'
import Timeline from './components/Timeline'

async function load(id: number) {
  const call = await source.getCall(id)
  if (!call) return undefined
  return { call, caller: await source.getCaller(call.caller) }
}

/** One call: the rules fixed at open, where it stands, and who made it. */
export default function CallPage() {
  const id = Number(useParams().id)
  const data = useLoad(() => load(id), [id])
  const now = useNow(30_000)
  useTitle(data ? `${data.call.token.symbol} #${id} · trustpool` : 'Call · trustpool')

  if (data === undefined) return <main className="min-h-screen pt-32" />
  if (data === null) {
    return (
      <main className="min-h-[70vh] pt-32">
        <Container>
          <p className="text-[15px] text-ink-quiet">There is no call #{id}.</p>
        </Container>
      </main>
    )
  }

  const { call, caller } = data
  const result = returnBps(call)
  const exitLeft = call.exitAt !== undefined ? call.exitAt - now : undefined

  return (
    <main className="min-h-screen pb-24 pt-28 sm:pt-32">
      <Container>
        <Link to="/calls" className="inline-flex items-center gap-2 text-[13px] text-ink-quiet hover:text-ink">
          <ArrowLeft size={14} /> All calls
        </Link>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[30px] font-semibold tracking-[-0.02em]">
                {call.token.symbol} <span className="text-ink-quiet">#{call.id}</span>
              </h1>
              <StateTag state={call.state} />
            </div>
            <p className="mt-2 text-[14px] text-ink-quiet">
              {call.token.name} · <span className="num">{shortAddress(call.token.address)}</span>
            </p>
          </div>
          {!source.live && <DemoNote />}
        </div>

        {call.state === 'Exiting' && exitLeft !== undefined && (
          <div className="mt-8 rounded-panel border border-accent bg-accent-fill px-5 py-4 text-[15px] text-accent-deep">
            The caller announced an exit on <span className="num">{date(call.announcedAt ?? now)}</span>.{' '}
            {exitLeft > 0 ? (
              <>
                It can execute in <span className="num font-medium">{duration(exitLeft)}</span>, at <span className="num">{date(call.exitAt!)}</span>.
              </>
            ) : (
              <>It can execute now.</>
            )}
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <Panel className="p-6">
              <div className="flex items-center justify-between gap-4">
                <p className="eyebrow text-ink-quiet">Rules</p>
                <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-quiet">
                  <Lock size={12} /> Fixed at open. The caller cannot change these.
                </span>
              </div>
              <div className="mt-4">
                <Row label="Token">{call.token.symbol}</Row>
                <Row label="Lock">
                  <span className="num">{duration(call.unlockAt - call.openedAt)}</span>, until <span className="num">{date(call.unlockAt)}</span>
                </Row>
                <Row label="Exit notice">
                  <span className="num">{duration(call.notice)}</span> between announcing and selling
                </Row>
                <Row label="Thesis">
                  <span className="text-ink-quiet">“{call.thesis}”</span>
                </Row>
              </div>
            </Panel>

            <Panel className="p-6">
              <p className="eyebrow text-ink-quiet">Position</p>
              <div className="mt-4">
                <Row label="Caller put in">
                  <span className="num">{mon(call.monIn)}</span>
                </Row>
                <Row label="Tokens received">
                  <span className="num">{tokens(call.tokens)}</span>
                </Row>
                <Row label="Entry price">
                  <span className="num">{price(entryPrice(call))} MON</span>
                </Row>
                {call.monOut !== undefined && (
                  <Row label="Caller took out">
                    <span className="num">{mon(call.monOut)}</span>
                  </Row>
                )}
                {result !== undefined && (
                  <Row label="Result, from the actual fill">
                    <Signed bps={result} className="text-[15px]" />
                  </Row>
                )}
              </div>
              <p className="mt-4 border-t border-line pt-4 text-[13px] leading-[1.6] text-ink-quiet">
                The entry price is the caller&apos;s own fill, before the call was public. Anyone buying after it pays the market price at that moment.
              </p>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel className="p-6">
              <p className="eyebrow text-ink-quiet">Timeline</p>
              <div className="mt-5">
                <Timeline call={call} now={now} />
              </div>
            </Panel>

            {caller && (
              <Panel className="p-6">
                <p className="eyebrow text-ink-quiet">Caller</p>
                <div className="mt-3 text-[15px]">
                  <Address value={caller.address} handle={caller.handle} />
                </div>
                <div className="mt-4">
                  <Row label="Record">{recordLine(caller.record)}</Row>
                  <Row label="Average result">
                    <Signed bps={averageBps(caller.record)} />
                  </Row>
                  <Row label="Bond">
                    <span className="num">{mon(caller.bond)}</span>
                  </Row>
                  <Row label="Bond slashed">
                    <span className={`num ${caller.record.slashes > 0 ? 'text-loss' : ''}`}>{caller.record.slashes} times</span>
                  </Row>
                </div>
              </Panel>
            )}
          </div>
        </div>
      </Container>
    </main>
  )
}
