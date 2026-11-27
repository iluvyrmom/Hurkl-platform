/* Mason app — voice: the mic that listens to the founder, and Mason's spoken replies.
 *
 * Listening (same rules as the A-1 website's tested voice, 2026-11-26):
 *  - The mic stays on through short pauses (continuous listening), so the phone doesn't chime
 *    mid-sentence. The message is sent after SILENCE_MS of quiet, or at once when the mic is tapped.
 *  - Phones that repeat earlier words inside later results are merged, so each word is sent once.
 *  - Hands-free: after Mason answers, the mic turns itself back on. Two quiet turns in a row rest it.
 *  - Mason never listens while he is speaking (so he can't hear himself).
 * Speaking: Mason's ElevenLabs voice from mason-talk; if that isn't available, the phone's own voice.
 * Nothing here is stored; no audio is recorded. */
(function () {
  "use strict";
  const SILENCE_MS = 2000;
  const MAX_QUIET_TURNS = 2;

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
   * opts.onStatus(key)     — idle | listening | thinking | speaking | resting | allowMic | unsupported
   * opts.fetchSpeech(text) — Promise of { audio, mime } | { fallback: true, speechText } | null
   */
  function create(opts) {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const state = {
      handsFree: false, listening: false, sentThisTurn: false, heardSpeech: false, quietTurns: 0,
      pending: "", sessionFinal: "", sessionLive: "", sendTimer: null, resumeTimer: null,
      speaking: false, audio: null, speakerOn: true,
    };
    try { state.speakerOn = localStorage.getItem("masonSpeaker") !== "off"; } catch { /* default on */ }
    let recognition = null;

    function status(k) { if (opts.onStatus) opts.onStatus(k); }
    function wordsSoFar() { return joinWords(state.pending, state.sessionFinal || state.sessionLive); }
    function clearSendTimer() { if (state.sendTimer) { clearTimeout(state.sendTimer); state.sendTimer = null; } }
    function clearPending() { clearSendTimer(); state.pending = ""; state.sessionFinal = ""; state.sessionLive = ""; }
    function armSendTimer() { clearSendTimer(); state.sendTimer = setTimeout(() => { state.sendTimer = null; finishTurn(); }, SILENCE_MS); }

    function startListening() {
      if (!recognition || state.listening || state.speaking) return false;
      state.heardSpeech = false; state.sessionFinal = ""; state.sessionLive = "";
      try { recognition.start(); return true; } catch { return false; }
    }
    function stopListening() { if (recognition && state.listening) { try { recognition.stop(); } catch { /* ignore */ } } }

    function finishTurn() {
      const message = wordsSoFar();
      clearPending();
      if (!message || state.sentThisTurn) return;
      state.sentThisTurn = true;
      state.quietTurns = 0;
      stopListening();
      status("thinking");
      opts.onMessage(message);
    }

    function endHandsFree() {
      state.handsFree = false; state.quietTurns = 0;
      clearPending();
      if (state.resumeTimer) { clearTimeout(state.resumeTimer); state.resumeTimer = null; }
      stopListening();
    }

    if (Ctor) {
      recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.addEventListener("start", () => { state.listening = true; status("listening"); });
      recognition.addEventListener("result", (e) => {
        if (state.sentThisTurn || state.speaking) return;
        let fin = "", live = "";
        for (let i = 0; i < e.results.length; i++) {
          const piece = e.results[i][0].transcript;
          if (e.results[i].isFinal) fin = mergeWords(fin, piece); else live = mergeWords(live, piece);
        }
        if (!fin && !live) return;
        state.heardSpeech = true; state.quietTurns = 0;
        state.sessionFinal = fin;
        state.sessionLive = mergeWords(fin, live);
        if (opts.onWords) opts.onWords(wordsSoFar());
        armSendTimer(); // restarts on every word, so it only fires after quiet
      });
      recognition.addEventListener("error", (e) => {
        state.listening = false;
        if (e && (e.error === "not-allowed" || e.error === "service-not-allowed")) { endHandsFree(); status("allowMic"); }
      });
      recognition.addEventListener("end", () => {
        state.listening = false;
        if (state.sentThisTurn || state.speaking) return;
        const heard = state.sessionFinal || state.sessionLive;
        if (heard) state.pending = joinWords(state.pending, heard);
        state.sessionFinal = ""; state.sessionLive = "";
        if (state.pending) {
          if (!state.sendTimer) armSendTimer();
          if (!startListening()) finishTurn();
          return;
        }
        if (!state.handsFree) { status("idle"); return; }
        if (!state.heardSpeech) state.quietTurns += 1;
        if (state.quietTurns >= MAX_QUIET_TURNS) { endHandsFree(); status("resting"); return; }
        if (!startListening()) status("idle");
      });
    }

    // ---------- speaking ----------
    function stopSpeaking() {
      if (state.audio) { try { state.audio.pause(); } catch { /* ignore */ } }
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch { /* ignore */ }
      state.speaking = false;
    }

    // Some phones never report that speech finished; a safety timer keeps the talk moving.
    function safetyMs(text) { return 4000 + String(text || "").length * 90; }

    function phoneVoice(text) {
      return new Promise((resolve) => {
        if (!("speechSynthesis" in window)) return resolve();
        const safety = setTimeout(resolve, safetyMs(text));
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-US";
        const voices = window.speechSynthesis.getVoices() || [];
        const pick = voices.find((v) => /en[-_]US/i.test(v.lang) && /male|guy|david|alex|daniel/i.test(v.name)) || voices.find((v) => /en[-_]US/i.test(v.lang));
        if (pick) u.voice = pick;
        u.onend = () => { clearTimeout(safety); resolve(); };
        u.onerror = () => { clearTimeout(safety); resolve(); };
        window.speechSynthesis.speak(u);
      });
    }

    function playAudio(data, text) {
      return new Promise((resolve) => {
        const a = state.audio || new Audio();
        state.audio = a;
        const safety = setTimeout(() => resolve(true), safetyMs(text) + 4000);
        const done = () => { clearTimeout(safety); a.onended = null; a.onerror = null; resolve(true); };
        a.onended = done;
        a.onerror = () => { clearTimeout(safety); a.onended = null; a.onerror = null; resolve(false); };
        a.src = `data:${data.mime};base64,${data.audio}`;
        a.play().catch(() => { clearTimeout(safety); resolve(false); });
      });
    }

    /** Speak Mason's reply (if the speaker is on), then reopen the mic in hands-free mode. */
    async function speakReply(text) {
      if (state.speakerOn && text) {
        state.speaking = true;
        stopListening();
        status("speaking");
        try {
          const data = await opts.fetchSpeech(text);
          if (state.speaking) {
            if (data && data.audio) {
              const ok = await playAudio(data, data.speechText || text);
              if (!ok && state.speaking) await phoneVoice(data.speechText || text);
            } else if (data && data.fallback) {
              await phoneVoice(data.speechText || text);
            }
          }
        } catch { /* reply is still on screen */ }
        state.speaking = false;
      }
      resumeHandsFree();
    }

    function resumeHandsFree() {
      if (!state.handsFree) { status("idle"); return; }
      if (state.resumeTimer) clearTimeout(state.resumeTimer);
      // Short pause so the tail of Mason's voice isn't picked up.
      state.resumeTimer = setTimeout(() => {
        state.resumeTimer = null;
        if (!state.handsFree) return;
        state.sentThisTurn = false;
        clearPending();
        if (!startListening()) status("idle");
      }, 350);
    }

    /** The mic button: start a hands-free talk, send now if mid-sentence, or stop. */
    function micTapped() {
      // A tap counts as permission for the phone to play Mason's voice.
      if (!state.audio) { state.audio = new Audio(); }
      if (!recognition) { status("unsupported"); return; }
      if (state.speaking) { stopSpeaking(); resumeHandsFree(); return; }
      if (wordsSoFar()) { finishTurn(); return; }
      if (state.listening || state.handsFree) { endHandsFree(); status("idle"); return; }
      state.handsFree = true; state.quietTurns = 0; state.sentThisTurn = false;
      if (!startListening()) status("idle");
    }

    function setSpeaker(on) {
      state.speakerOn = !!on;
      try { localStorage.setItem("masonSpeaker", on ? "on" : "off"); } catch { /* ignore */ }
      if (!on) stopSpeaking();
    }

    /** Typing a message ends a hands-free talk. */
    function typed() { endHandsFree(); stopSpeaking(); }

    return {
      supported: !!recognition,
      micTapped, speakReply, setSpeaker, typed, stopSpeaking,
      speakerOn: () => state.speakerOn,
      isHandsFree: () => state.handsFree,
      afterFailedReply: () => { state.speaking = false; resumeHandsFree(); },
    };
  }

  window.MasonVoice = { create, mergeWords };
})();
