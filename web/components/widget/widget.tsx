"use client"

import { useEffect, useState } from "react"

import { ChatScreen } from "@/components/widget/chat-screen"
import { VoiceScreen } from "@/components/widget/voice-screen"
import {
  AuthScreen,
  ErrorScreen,
  InboxScreen,
  LoadingScreen,
  SelectionScreen,
} from "@/components/widget/screens"
import { ApiError, widgetApi } from "@/lib/widget-api"

type Screen =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "auth" }
  | { name: "selection" }
  | { name: "inbox" }
  | { name: "chat"; conversationId: string }
  | { name: "voice"; conversationId: string }

// One contact session per organization, remembered in this browser.
const storageKey = (organizationId: string) =>
  `echo_contact_session_${organizationId}`

function readSession(organizationId: string) {
  try {
    return localStorage.getItem(storageKey(organizationId))
  } catch {
    return null
  }
}

function writeSession(organizationId: string, session: string | null) {
  try {
    if (session) localStorage.setItem(storageKey(organizationId), session)
    else localStorage.removeItem(storageKey(organizationId))
  } catch {
    // Storage blocked (private mode, sandboxed iframe): session lasts this page view.
  }
}

export function Widget({ organizationId }: { organizationId: string | null }) {
  const [screen, setScreen] = useState<Screen>(
    organizationId
      ? { name: "loading" }
      : { name: "error", message: "Missing organizationId in the widget URL." }
  )
  const [session, setSession] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false

    async function init(orgId: string) {
      try {
        await widgetApi.organization(orgId)
        let valid: string | null = null
        const stored = readSession(orgId)
        if (stored) {
          try {
            await widgetApi.currentSession(stored)
            valid = stored
          } catch {
            writeSession(orgId, null) // expired or unknown: ask again
          }
        }
        if (cancelled) return
        setSession(valid)
        setScreen(valid ? { name: "selection" } : { name: "auth" })
      } catch (error) {
        if (cancelled) return
        setScreen({
          name: "error",
          message:
            error instanceof ApiError && error.status === 404
              ? "This widget isn't set up correctly (unknown organization)."
              : "Couldn't connect. Please try again later.",
        })
      }
    }

    init(organizationId)
    return () => {
      cancelled = true
    }
  }, [organizationId])

  function signedIn(newSession: string) {
    if (!organizationId) return
    writeSession(organizationId, newSession)
    setSession(newSession)
    setScreen({ name: "selection" })
  }

  function sessionExpired() {
    if (organizationId) writeSession(organizationId, null)
    setSession(null)
    setScreen({ name: "auth" })
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-muted">
      {screen.name === "loading" && <LoadingScreen />}
      {screen.name === "error" && <ErrorScreen message={screen.message} />}
      {screen.name === "auth" && organizationId && (
        <AuthScreen organizationId={organizationId} onSignedIn={signedIn} />
      )}
      {session && screen.name === "selection" && (
        <SelectionScreen
          session={session}
          onChat={(conversationId) =>
            setScreen({ name: "chat", conversationId })
          }
          onVoice={(conversationId) =>
            setScreen({ name: "voice", conversationId })
          }
          onInbox={() => setScreen({ name: "inbox" })}
          onExpired={sessionExpired}
        />
      )}
      {session && screen.name === "inbox" && (
        <InboxScreen
          session={session}
          onOpen={(conversationId) =>
            setScreen({ name: "chat", conversationId })
          }
          onBack={() => setScreen({ name: "selection" })}
          onExpired={sessionExpired}
        />
      )}
      {session && screen.name === "voice" && (
        <VoiceScreen
          key={screen.conversationId}
          session={session}
          conversationId={screen.conversationId}
          onBack={() => setScreen({ name: "selection" })}
          onChat={() =>
            setScreen({ name: "chat", conversationId: screen.conversationId })
          }
        />
      )}
      {session && screen.name === "chat" && (
        <ChatScreen
          key={screen.conversationId}
          session={session}
          conversationId={screen.conversationId}
          onBack={() => setScreen({ name: "selection" })}
          onExpired={sessionExpired}
        />
      )}
    </div>
  )
}
