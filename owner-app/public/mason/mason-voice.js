/* Mason app — voice: the mic that listens to the founder, and Mason's spoken replies.
 *
 * Kept deliberately simple (2026-11-27, founder: "no multiple connecting, just Mason's voice"):
 *  - One tap = one turn. The mic opens once, stays on through short pauses, and sends after
 *    SILENCE_MS of quiet (or at once when the mic is tapped again). It never reopens by itself,
 *    so the phone chimes once when it opens and once when it closes, nothing more.
 *  - Phones that repeat earlier words inside later results are merged, so each word is sent once.
 *  - Mason never listens while he is speaking.
 * Speaking: only Mason's own ElevenLabs voice, from mason-talk. If his voice can't be reached,
 * the reply stays on screen and the status line says so (no stand-in voice).
 * Nothing here is stored; no audio is recorded. */
(function () {
  "use strict";
  const SILENCE_MS = 2000;

  function joinWords(a, b) { return (String(a || "") + " " + String(b || "")).replace(/\s+/g, " ").trim(); }
  function mergeWords(sofar, piece) {
    const a = String(sofar || "").trim(), b = String(piece || "").trim();
    if (!a) return b;
    if (!b) return a;
    const la = a.toLowerCase(), lb = b.toLowerCase();
    if (lb.indexOf(la) === 0) return b;
    if (la.slice(-lb.length) === lb) return a;
    return joinWords(a, b);
  }

  /**
   * opts.onMessage(text)   — the founder finished talking: send this message to Mason.
   * opts.onWords(text)     — words so far, to show in the text box while he talks.
   * opts.onStatus(key)     — idle | listening | thinking | speaking | voiceOffline | allowMic | unsupported
   * opts.fetchSpeech(text) — Promise of { audio, mime, speechText } | { fallback: true } | null
   */
  function create(opts) {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const state = { listening: false, sent: false, words: "", sendTimer: null, speaking: false, audio: null, speakerOn: true };
    try { state.speakerOn = localStorage.getItem("masonSpeaker") !== "off"; } catch { /* default on */ }
    let recognition = null;

    function status(k) { if (opts.onStatus) opts.onStatus(k); }
    function clearSendTimer() { if (state.sendTimer) { clearTimeout(state.sendTimer); state.sendTimer = null; } }
    function stopListening() { if (recognition && state.listening) { try { recognition.stop(); } catch { /* ignore */ } } }

    /** Send what was heard, once per turn, and close the mic. */
    function finishTurn() {
      clearSendTimer();
      const message = state.words.trim();
      state.words = "";
      stopListening();
      if (!message || state.sent) { if (!state.sent) status("idle"); return; }
      state.sent = true;
      status("thinking");
      opts.onMessage(message);
    }

    if (Ctor) {
      recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.addEventListener("start", () => { state.listening = true; status("listening"); });
      recognition.addEventListener("result", (e) => {
        if (state.sent || state.speaking) return;
        let fin = "", live = "";
        for (let i = 0; i < e.results.length; i++) {
          const piece = e.results[i][0].transcript;
          if (e.results[i].isFinal) fin = mergeWords(fin, piece); else live = mergeWords(live, piece);
        }
        const heard = mergeWords(fin, live);
        if (!heard) return;
        state.words = heard;
        if (opts.onWords) opts.onWords(heard);
        clearSendTimer();
        state.sendTimer = setTimeout(finishTurn, SILENCE_MS); // restarts on every word, fires after quiet
      });
      recognition.addEventListener("error", (e) => {
        if (e && (e.error === "not-allowed" || e.error === "service-not-allowed")) { state.listening = false; clearSendTimer(); status("allowMic"); }
      });
      // The phone closed the mic: send what was heard (if anything). Never reopen on its own.
      recognition.addEventListener("end", () => {
        state.listening = false;
        if (!state.sent && !state.speaking) finishTurn();
      });
    }

    // ---------- speaking ----------
    function stopSpeaking() {
      if (state.audio) { try { state.audio.pause(); } catch { /* ignore */ } }
      state.speaking = false;
    }

    function playAudio(data) {
      return new Promise((resolve) => {
        const a = state.audio || new Audio();
        state.audio = a;
        // Some phones never report that audio finished; a safety timer keeps the app moving.
        const safety = setTimeout(() => resolve(true), 8000 + String(data.speechText || "").length * 90);
        const done = (ok) => { clearTimeout(safety); a.onended = null; a.onerror = null; resolve(ok); };
        a.onended = () => done(true);
        a.onerror = () => done(false);
        a.src = `data:${data.mime};base64,${data.audio}`;
        a.play().catch(() => done(false));
      });
    }

    /** Speak Mason's reply in his own voice (if the speaker is on). */
    async function speakReply(text) {
      state.sent = false;
      if (!state.speakerOn || !text) { status("idle"); return; }
      state.speaking = true;
      status("speaking");
      let ok = false;
      try {
        const data = await opts.fetchSpeech(text);
        if (state.speaking && data && data.audio) ok = await playAudio(data);
      } catch { /* reply is still on screen */ }
      const cutIn = !state.speaking;
      state.speaking = false;
      if (!cutIn) status(ok ? "idle" : "voiceOffline");
    }

    /** The mic button: start listening, send now if mid-sentence, stop, or cut Mason off. */
    function micTapped() {
      // A tap counts as permission for the phone to play Mason's voice.
      if (!state.audio) { state.audio = new Audio(); }
      if (!recognition) { status("unsupported"); return; }
      if (state.speaking) { stopSpeaking(); status("idle"); return; }
      if (state.listening) { finishTurn(); return; }
      state.sent = false; state.words = "";
      try { recognition.start(); } catch { status("idle"); }
    }

    function setSpeaker(on) {
      state.speakerOn = !!on;
      try { localStorage.setItem("masonSpeaker", on ? "on" : "off"); } catch { /* ignore */ }
      if (!on) stopSpeaking();
    }

    /** Typing a message closes the mic and stops Mason talking. */
    function typed() { clearSendTimer(); state.words = ""; state.sent = false; stopListening(); stopSpeaking(); }

    return {
      supported: !!recognition,
      micTapped, speakReply, setSpeaker, typed, stopSpeaking,
      speakerOn: () => state.speakerOn,
      afterFailedReply: () => { state.sent = false; state.speaking = false; status("idle"); },
    };
  }

  window.MasonVoice = { create, mergeWords };
})();
