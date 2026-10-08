"use client"

import {
  PipecatClient,
  RTVIEvent,
  type BotOutputData,
  type TranscriptData,
} from "@pipecat-ai/client-js"
import {
  PipecatClientAudio,
  PipecatClientProvider,
  VoiceVisualizer,
  usePipecatClient,
  usePipecatClientMicControl,
  useRTVIClientEvent,
} from "@pipecat-ai/client-react"
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport"
import {
  MessageSquareTextIcon,
  MicIcon,
  MicOffIcon,
  PhoneIcon,
  PhoneOffIcon,
} from "lucide-react"
import { useEffect, useState } from "react"

import { EchoGlyph } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { EchoAvatar } from "@/components/user-avatar"
import { WidgetMessage } from "@/components/widget/chat-screen"
import { BackHeader, PoweredBy } from "@/components/widget/screens"
import { cn } from "@/lib/utils"

// speaking: the words heard so far of the piece the bot is saying.
type Line = { role: "user" | "bot"; text: string; speaking?: string }
type CallState = "idle" | "connecting" | "live" | "ended" | "failed"

/**
 * A voice call with the local voice bot (voice/, Pipecat). Audio goes
 * browser ⇄ bot directly over WebRTC; only the connection setup (the SDP
 * offer and answer) goes through Next.js to the bot's /offer endpoint,
 * with the contact session header like every other widget request.
 */
export function VoiceScreen(props: {
  session: string
  orgName: string
  conversationId: string
  onBack: () => void
  onChat: () => void
}) {
  // One client per call screen, created in the browser only (this screen
  // is never server-rendered: it appears after a click).
  const [client] = useState(
    () =>
      new PipecatClient({
        transport: new SmallWebRTCTransport(),
        enableMic: true,
        enableCam: false,
      })
  )
  useEffect(
    () => () => {
      client.disconnect()
    },
    [client]
  )

  return (
    <PipecatClientProvider client={client}>
      <PipecatClientAudio />
      <VoiceCall {...props} />
    </PipecatClientProvider>
  )
}

/**
 * Echo on a call. Sound is drawn as echoes: rings leaving the mark while
 * someone speaks. Ink while Echo speaks, orange while the customer does,
 * because it is their turn.
 */
export function CallOrb({
  connecting,
  speaker,
}: {
  connecting?: boolean
  speaker?: "echo" | "customer" | null
}) {
  return (
    <div className="relative my-4 flex size-18 items-center justify-center rounded-full bg-foreground text-background">
      {speaker &&
        [0, 300, 600].map((delay, index) => (
          <span
            key={delay}
            className={cn(
              "absolute inset-0 rounded-full border-2 motion-safe:animate-echo",
              speaker === "echo" ? "border-foreground" : "border-primary",
              // Without motion the rings hold still at three sizes.
              [
                "motion-reduce:scale-[1.22] motion-reduce:opacity-55",
                "motion-reduce:scale-[1.44] motion-reduce:opacity-30",
                "motion-reduce:scale-[1.66] motion-reduce:opacity-15",
              ][index]
            )}
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      {connecting ? (
        <Spinner className="size-6" />
      ) : (
        <EchoGlyph className="size-[30px]" />
      )}
    </div>
  )
}

function VoiceCall({
  session,
  orgName,
  conversationId,
  onBack,
  onChat,
}: {
  session: string
  orgName: string
  conversationId: string
  onBack: () => void
  onChat: () => void
}) {
  const client = usePipecatClient()
  const { enableMic, isMicEnabled } = usePipecatClientMicControl()
  const [state, setState] = useState<CallState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [botSpeaking, setBotSpeaking] = useState(false)
  const [userSpeaking, setUserSpeaking] = useState(false)

  useRTVIClientEvent(RTVIEvent.BotReady, () => setState("live"))
  useRTVIClientEvent(RTVIEvent.Disconnected, () =>
    setState((current) => (current === "failed" ? current : "ended"))
  )
  useRTVIClientEvent(RTVIEvent.BotStartedSpeaking, () => setBotSpeaking(true))
  useRTVIClientEvent(RTVIEvent.BotStoppedSpeaking, () => setBotSpeaking(false))
  useRTVIClientEvent(RTVIEvent.UserStartedSpeaking, () => setUserSpeaking(true))
  useRTVIClientEvent(RTVIEvent.UserStoppedSpeaking, () =>
    setUserSpeaking(false)
  )
  // What you said, once Whisper has the final text of your turn.
  useRTVIClientEvent(RTVIEvent.UserTranscript, (data: TranscriptData) => {
    if (data.final && data.text.trim())
      setLines((all) => [...all, { role: "user", text: data.text.trim() }])
  })
  // The bot's reply arrives piece by piece (a clause or a sentence), and each
  // piece word by word as it is heard: "in-progress" with the words so far,
  // then "completed". One line per turn: the finished pieces plus the words
  // heard of the one being spoken, like live captions. When the caller cuts
  // in, the line keeps exactly what they heard.
  useRTVIClientEvent(RTVIEvent.BotOutput, (data: BotOutputData) => {
    const status = data.spoken_status
    if (status !== "in-progress" && status !== "completed") return
    const heard = (data.spoken_progress?.accumulated_text ?? data.text).trim()
    if (!heard) return
    setLines((all) => {
      const last = all.at(-1)
      const done = last?.role === "bot" ? last.text : ""
      const line: Line =
        status === "completed"
          ? { role: "bot", text: `${done} ${heard}`.trim() }
          : { role: "bot", text: done, speaking: heard }
      return last?.role === "bot" ? [...all.slice(0, -1), line] : [...all, line]
    })
  })

  async function start() {
    if (!client) return
    setState("connecting")
    setError(null)
    try {
      await client.connect({
        webrtcRequestParams: {
          endpoint: "/api/voice/offer",
          headers: new Headers({ "X-Contact-Session": session }),
          requestData: { conversation_id: conversationId },
        },
      })
    } catch (err) {
      setState("failed")
      setError(
        err instanceof Error && /Permission|NotAllowed/i.test(err.message)
          ? "Microphone access is needed for a voice call."
          : "Couldn't start the call. Please try again."
      )
    }
  }

  const live = state === "live"
  const status =
    state === "idle"
      ? "Talk to our assistant"
      : state === "connecting"
        ? "Connecting…"
        : live
          ? botSpeaking
            ? "Speaking…"
            : userSpeaking
              ? "Listening…"
              : "Go ahead, I'm listening"
          : state === "ended"
            ? "Call ended"
            : "Call failed"

  return (
    <>
      <BackHeader
        title={orgName}
        subtitle={live ? "On a call" : "Voice call"}
        onBack={onBack}
        avatar={<EchoAvatar online={live} className="size-9" />}
      />

      <div className="flex shrink-0 flex-col items-center gap-3 border-b px-6 pt-10 pb-6 text-center">
        <CallOrb
          connecting={state === "connecting"}
          speaker={
            !live
              ? null
              : botSpeaking
                ? "echo"
                : userSpeaking
                  ? "customer"
                  : null
          }
        />
        <div className="grid justify-items-center gap-1">
          <p className="title-section">{status}</p>
          <div className="flex h-6 items-center text-foreground">
            {live ? (
              <VoiceVisualizer
                participantType="bot"
                barColor="currentColor"
                backgroundColor="transparent"
                barCount={11}
                barWidth={3}
                barGap={3}
                barMaxHeight={22}
              />
            ) : (
              <p className="text-[13px]/4.5 text-muted-foreground">
                {state === "idle"
                  ? "Ask anything, the way you'd ask a person."
                  : state === "ended"
                    ? "The transcript is saved in this conversation."
                    : ""}
              </p>
            )}
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {lines.length === 0 && (
          <p className="my-auto text-center text-[13px]/4.5 text-muted-foreground">
            Live captions of the call will appear here.
          </p>
        )}
        {lines.map((line, index) => (
          <WidgetMessage
            key={index}
            message={{
              role: line.role === "user" ? "customer" : "assistant",
              content: [line.text, line.speaking].filter(Boolean).join(" "),
            }}
          />
        ))}
      </div>

      <div className="shrink-0 border-t px-4 pt-4">
        <div className="flex items-center justify-center gap-4">
          {live || state === "connecting" ? (
            <>
              <Button
                variant="outline"
                size="icon-lg"
                className="size-12 rounded-full [&_svg:not([class*='size-'])]:size-5"
                aria-label={isMicEnabled ? "Mute" : "Unmute"}
                onClick={() => enableMic(!isMicEnabled)}
                disabled={!live}
              >
                {isMicEnabled ? <MicIcon /> : <MicOffIcon />}
              </Button>
              <Button
                variant="danger"
                size="icon-lg"
                className="size-14 rounded-full"
                aria-label="End call"
                onClick={() => client?.disconnect()}
              >
                <PhoneOffIcon className="size-5" />
              </Button>
            </>
          ) : state === "ended" ? (
            <Button size="lg" className="flex-1 rounded-full" onClick={onChat}>
              <MessageSquareTextIcon /> Continue in chat
            </Button>
          ) : (
            <Button size="lg" className="flex-1 rounded-full" onClick={start}>
              <PhoneIcon /> Start call
            </Button>
          )}
        </div>
        <PoweredBy />
      </div>
    </>
  )
}
