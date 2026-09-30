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
  LoaderIcon,
  MessageSquareTextIcon,
  MicIcon,
  MicOffIcon,
  PhoneIcon,
  PhoneOffIcon,
} from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { BackHeader } from "@/components/widget/screens"
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

function VoiceCall({
  session,
  conversationId,
  onBack,
  onChat,
}: {
  session: string
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
      return last?.role === "bot"
        ? [...all.slice(0, -1), line]
        : [...all, line]
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

  const status =
    state === "idle"
      ? "Talk to our assistant"
      : state === "connecting"
        ? "Connecting…"
        : state === "live"
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
      <BackHeader title="Voice call" onBack={onBack} />
      <div className="flex flex-col items-center gap-3 border-b bg-background p-6">
        <div
          className={cn(
            "flex h-20 w-full items-center justify-center rounded-xl bg-muted",
            botSpeaking && "ring-2 ring-primary/40"
          )}
        >
          {state === "live" ? (
            <VoiceVisualizer
              participantType="bot"
              barColor="currentColor"
              backgroundColor="transparent"
              barCount={9}
              barWidth={6}
              barGap={6}
              barMaxHeight={48}
            />
          ) : state === "connecting" ? (
            <LoaderIcon className="animate-spin text-muted-foreground" />
          ) : (
            <PhoneIcon className="text-muted-foreground" />
          )}
        </div>
        <p className="text-sm font-medium">{status}</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4 text-sm">
        {lines.length === 0 && (
          <p className="text-center text-xs text-muted-foreground">
            The conversation will appear here.
          </p>
        )}
        {lines.map((line, index) => (
          <p
            key={index}
            className={cn(
              "max-w-[85%] rounded-2xl px-3 py-2",
              line.role === "user"
                ? "self-end bg-primary text-primary-foreground"
                : "self-start border bg-background"
            )}
          >
            {[line.text, line.speaking].filter(Boolean).join(" ")}
          </p>
        ))}
      </div>

      <div className="flex gap-2 border-t bg-background p-3">
        {state === "live" || state === "connecting" ? (
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label={isMicEnabled ? "Mute" : "Unmute"}
              onClick={() => enableMic(!isMicEnabled)}
              disabled={state !== "live"}
            >
              {isMicEnabled ? <MicIcon /> : <MicOffIcon />}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => client?.disconnect()}
            >
              <PhoneOffIcon /> End call
            </Button>
          </>
        ) : state === "ended" ? (
          <Button variant="outline" className="flex-1" onClick={onChat}>
            <MessageSquareTextIcon /> Continue in chat
          </Button>
        ) : (
          <Button className="flex-1" onClick={start}>
            <PhoneIcon /> Start call
          </Button>
        )}
      </div>
    </>
  )
}
