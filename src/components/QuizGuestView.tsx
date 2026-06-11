/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Sparkles, Heart, Clock, CheckCircle2, Trophy, Timer, Hourglass, ArrowLeft, Award, Lock } from "lucide-react";
import { collection, onSnapshot, doc, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { motion, AnimatePresence } from "motion/react";
import aveigaLogo from "../assets/images/aveiga_logo_1780324634704.png";

interface QuizGuestViewProps {
  mesa: number | null;
  onSetMesa: (mesaNum: number) => void;
  onClearMesa: () => void;
  anonId?: string;
  guestName?: string;
}

interface QuizState {
  currentQuestionIndex: number; // 0 to 29
  status: "idle" | "running" | "paused" | "ended";
  timerDuration: number;
  timerStartedAt?: any; // Firestore Timestamp
  revealWinners?: boolean;
  winners?: number[]; // [1st, 2nd, 3rd] place table numbers
  correctAnswers?: { [questionId: string]: "A" | "B" | "C" };
  ceremonyStep?: "idle" | 3 | 2 | 1;
}

export default function QuizGuestView({ mesa, onSetMesa, onClearMesa, anonId, guestName }: QuizGuestViewProps) {
  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [selectedOption, setSelectedOption] = useState<"A" | "B" | "C" | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [tableLockStatus, setTableLockStatus] = useState<{ isLocked: boolean; activeGuest?: string } | null>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [showWelcome, setShowWelcome] = useState(true);

  const handleVamosJogar = async () => {
    setShowWelcome(false);
    if (mesa && anonId) {
      try {
        const sessionDocRef = doc(db, "quiz_active_sessions", `mesa_${mesa}`);
        await setDoc(sessionDocRef, {
          readyToPlay: true,
          lastActiveAt: new Date()
        }, { merge: true });
      } catch (e) {
        console.error("Erro ao definir pronto para jogar:", e);
      }
    }
  };

  // Listen to guest quiz responses for rankings
  useEffect(() => {
    if (!mesa) return;
    const answersCol = collection(db, "quiz_answers");
    const unsubscribe = onSnapshot(answersCol, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setAnswers(list);
    });
    return () => unsubscribe();
  }, [mesa]);

  // 0. Single active session per table (QR code) restriction with heartbeat and auto-release
  useEffect(() => {
    if (!mesa || !anonId) {
      setTableLockStatus(null);
      return;
    }

    const sessionDocRef = doc(db, "quiz_active_sessions", `mesa_${mesa}`);
    let isOwner = false;

    const unsubscribe = onSnapshot(sessionDocRef, async (snap) => {
      const now = Date.now();
      
      if (!snap.exists()) {
        // Safe to claim
        isOwner = true;
        setTableLockStatus({ isLocked: false });
        try {
          await setDoc(sessionDocRef, {
            deviceId: anonId,
            guestName: guestName || "Sem Nome",
            lastActiveAt: new Date(),
            readyToPlay: false
          });
        } catch (e) {
          console.error("Erro ao iniciar sessão na mesa:", e);
        }
      } else {
        const data = snap.data();
        const dId = data.deviceId;
        const lastActiveAt = data.lastActiveAt;
        
        let lastActiveTime = 0;
        if (lastActiveAt) {
          const dt = lastActiveAt.toDate ? lastActiveAt.toDate() : new Date(lastActiveAt);
          lastActiveTime = dt.getTime();
        }

        const isTimeout = (now - lastActiveTime) > 35000;

        if (!dId || dId === anonId) {
          // Ours or empty
          isOwner = true;
          setTableLockStatus({ isLocked: false });
          // If empty, claim it
          if (!dId) {
            try {
              await setDoc(sessionDocRef, {
                deviceId: anonId,
                guestName: guestName || "Sem Nome",
                lastActiveAt: new Date(),
                readyToPlay: false
              });
            } catch (e) {
              console.error("Erro ao reivindicar mesa vazia:", e);
            }
          }
        } else if (isTimeout) {
          // Exceeded silence threshold -> Claim it!
          isOwner = true;
          setTableLockStatus({ isLocked: false });
          try {
            await setDoc(sessionDocRef, {
              deviceId: anonId,
              guestName: guestName || "Sem Nome",
              lastActiveAt: new Date(),
              readyToPlay: false
            });
          } catch (e) {
            console.error("Erro ao roubar sessão expirada:", e);
          }
        } else {
          // Owned by someone else
          isOwner = false;
          setTableLockStatus({
            isLocked: true,
            activeGuest: data.guestName || "Outro Convidado"
          });
        }
      }
    });

    // Heartbeat to keep session alive
    const heartbeatInterval = setInterval(async () => {
      if (isOwner) {
        try {
          await setDoc(sessionDocRef, {
            deviceId: anonId,
            guestName: guestName || "Sem Nome",
            lastActiveAt: new Date()
          }, { merge: true });
        } catch (e) {
          console.error("Erro ao atualizar batimento cardíaco da sessão:", e);
        }
      }
    }, 12000);

    // Release function on exit
    const releaseSession = async () => {
      if (isOwner) {
        try {
          await setDoc(sessionDocRef, {
            deviceId: null,
            guestName: null,
            lastActiveAt: null,
            readyToPlay: false
          }, { merge: true });
        } catch (e) {
          console.error("Erro ao libertar sessão:", e);
        }
      }
    };

    window.addEventListener("beforeunload", releaseSession);

    return () => {
      unsubscribe();
      clearInterval(heartbeatInterval);
      window.removeEventListener("beforeunload", releaseSession);
      // We do not release session here to prevent infinite loop of mount/unmount write-storms during pagination/navigation.
      // Explicit exit triggers or background timeout after 35s handle freeing the slot.
    };
  }, [mesa, anonId, guestName]);

  const handleExit = async () => {
    if (mesa && anonId) {
      try {
        const sessionDocRef = doc(db, "quiz_active_sessions", `mesa_${mesa}`);
        await setDoc(sessionDocRef, {
          deviceId: null,
          guestName: null,
          lastActiveAt: null,
          readyToPlay: false
        }, { merge: true });
      } catch (e) {
        console.error("Erro ao libertar sessão ao sair:", e);
      }
    }
    onClearMesa();
  };

  // 1. Listen to global Quiz state in real-time
  useEffect(() => {
    const stateDocRef = doc(db, "quiz_state", "current");
    const unsubscribe = onSnapshot(
      stateDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setQuizState(docSnap.data() as QuizState);
        } else {
          const initial: QuizState = {
            currentQuestionIndex: 0,
            status: "idle",
            timerDuration: 60,
            revealWinners: false,
            winners: [],
            correctAnswers: {}
          };
          setDoc(stateDocRef, initial);
          setQuizState(initial);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "quiz_state/current");
      }
    );

    return () => unsubscribe();
  }, []);

  // 1.5. Bypass welcome screen if the quiz has already started/is in progress
  useEffect(() => {
    if (quizState) {
      const isQuizInProgress = quizState.currentQuestionIndex > 0 || quizState.status === "running" || quizState.status === "ended";
      if (isQuizInProgress && showWelcome) {
        setShowWelcome(false);
        // Also update readyToPlay to active session
        if (mesa && anonId) {
          const sessionDocRef = doc(db, "quiz_active_sessions", `mesa_${mesa}`);
          setDoc(sessionDocRef, {
            readyToPlay: true,
            lastActiveAt: new Date()
          }, { merge: true }).catch((e) => {
            console.error("Erro ao definir pronto para jogar automaticamente:", e);
          });
        }
      }
    }
  }, [quizState, showWelcome, mesa, anonId]);

  const currentQNum = quizState ? quizState.currentQuestionIndex + 1 : 1;
  const currentQId = `q_${currentQNum}`;

  // 2. Track if the current table has already submitted a response for the active question
  useEffect(() => {
    if (mesa && currentQId) {
      const answerId = `mesa_${mesa}_${currentQId}`;
      const answerDocRef = doc(db, "quiz_answers", answerId);
      
      const unsubscribe = onSnapshot(answerDocRef, (snap) => {
        if (snap.exists()) {
          setIsSubmitted(true);
          setSelectedOption(snap.data().answer as "A" | "B" | "C");
        } else {
          setIsSubmitted(false);
          setSelectedOption(null);
        }
      });
      return () => unsubscribe();
    } else {
      setIsSubmitted(false);
      setSelectedOption(null);
    }
  }, [currentQId, mesa]);

  // 3. Client synchronised countdown tick
  useEffect(() => {
    if (!quizState || quizState.status !== "running" || !quizState.timerStartedAt) {
      setTimeLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const startedAt = quizState.timerStartedAt.toDate?.() || new Date(quizState.timerStartedAt);
      const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const remaining = Math.max(0, quizState.timerDuration - elapsed);
      setTimeLeft(remaining);

      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [quizState]);

  // 4. Auto-submit when time is up or DJ locks the answers, if they have selected an option
  useEffect(() => {
    const isOut = (timeLeft !== null && timeLeft <= 0) || (quizState?.status === "ended");
    if (isOut && selectedOption && !isSubmitted && !submitting && mesa && currentQId) {
      // Set submission flags optimistically first to lock the client immediately and prevent secondary trigger races
      setIsSubmitted(true);
      
      const autoSubmit = async () => {
        setSubmitting(true);
        const answerId = `mesa_${mesa}_${currentQId}`;
        const answerPayload = {
          id: answerId,
          tableNumber: mesa,
          questionId: currentQId,
          answer: selectedOption,
          submittedAt: new Date(),
          timeTakenSecs: timeLeft !== null ? quizState.timerDuration - timeLeft : quizState.timerDuration,
        };

        try {
          await setDoc(doc(db, "quiz_answers", answerId), answerPayload);
        } catch (error) {
          console.error("Erro no envio automático ao acabar o tempo:", error);
          // If the question is somehow still active and open, let them retry
          if (quizState?.status === "running") {
            setIsSubmitted(false);
          }
        } finally {
          setSubmitting(false);
        }
      };
      autoSubmit();
    }
  }, [timeLeft, quizState?.status, selectedOption, isSubmitted, submitting, mesa, currentQId, quizState?.timerDuration]);

  // Determine block states
  const isTimeOver = timeLeft !== null && timeLeft <= 0;
  const isSubmissionBlocked = isSubmitted || isTimeOver || !quizState || quizState.status === "idle" || quizState.status === "ended";

  // Handle Response Confirmation submission
  const handleConfirmAnswer = async () => {
    if (!mesa || !quizState || !selectedOption || isSubmissionBlocked || submitting) {
      return;
    }

    setSubmitting(true);
    const answerId = `mesa_${mesa}_${currentQId}`;

    const answerPayload = {
      id: answerId,
      tableNumber: mesa,
      questionId: currentQId,
      answer: selectedOption,
      submittedAt: new Date(),
      timeTakenSecs: timeLeft !== null ? quizState.timerDuration - timeLeft : 0,
    };

    try {
      await setDoc(doc(db, "quiz_answers", answerId), answerPayload);
      setIsSubmitted(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `quiz_answers/${answerId}`);
    } finally {
      setSubmitting(false);
    }
  };

  // UI State: No Table configured (encourages scanning the physical QR codes)
  if (!mesa) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 text-center select-none bg-gradient-to-b from-[#FAF9F5] to-white">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-8 border border-[#E6E8E3] shadow-md max-w-sm w-full flex flex-col items-center"
        >
          <div className="w-14 h-14 bg-[#4A5D4E]/10 rounded-full flex items-center justify-center mb-4 border border-[#4A5D4E]/20">
            <span className="text-2xl">🌿</span>
          </div>
          <h2 className="font-serif text-2xl text-[#2F453A] font-light tracking-wide mb-2.5">Portal do Quiz</h2>
          
          <div className="py-5 px-4 rounded-2xl border border-amber-200 bg-amber-50/50 text-[#7A6B3D] leading-relaxed text-xs">
            <p className="font-semibold text-sm">Leitura Obrigatória do Código QR</p>
            <p className="mt-2 text-[#5C6E5E]">
              Para jogar e acumular pontos para a sua mesa, por favor faça scan do código QR correspondente presente no centro da sua mesa!
            </p>
          </div>

          <p className="text-[10px] text-[#A3B1AA] mt-6 select-none font-sans uppercase tracking-widest">
            Rúben & Catarina • 14.06.2026
          </p>
        </motion.div>
      </div>
    );
  }

  // UI State: Table is locked/occupied by another active session
  if (tableLockStatus?.isLocked) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 text-center select-none bg-[#FAF9F5]">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-8 border border-[#E6E8E3] shadow-md max-w-sm w-full flex flex-col items-center"
        >
          <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mb-4 border border-amber-200">
            <Lock className="w-5 h-5 text-[#BF9B30]" />
          </div>
          <h2 className="font-serif text-2xl text-[#2F453A] font-light tracking-wide mb-2">Mesa Bloqueada</h2>
          <p className="text-xs text-[#788A81] mb-5">
            Apenas é permitida <b className="text-[#2F453A]">uma sessão ativa</b> de cada vez por mesa para garantir a integridade do jogo!
          </p>
          
          <div className="py-4 px-4 rounded-2xl border border-red-100 bg-red-50/50 text-[#9E2A2B] leading-relaxed text-xs w-full mb-6">
            <p className="font-bold text-sm mb-1 text-red-800">Mesa {mesa} em Jogo 📱</p>
            <p className="text-[#4E5C54]">
              O convidado <span className="font-bold text-[#2F453A]">{tableLockStatus.activeGuest || "Outro Telemóvel"}</span> está a responder neste momento.
            </p>
          </div>

          <div className="space-y-4 w-full">
            <p className="text-[10px] text-[#A3B1AA] italic leading-relaxed">
              Feche a página no outro telemóvel para jogar aqui. Este ecrã irá desbloquear-se assim que a sessão estiver livre (ou após 35 segundos de inatividade).
            </p>

            <button
              onClick={handleExit}
              className="w-full py-4 bg-[#FAF9F5] hover:bg-[#EBF0EC] text-[#4A5D4E] border border-[#E6E8E3] rounded-2xl font-bold text-xs transition active:scale-[0.99] cursor-pointer"
            >
              Voltar ao Portal Principal
            </button>
          </div>

          <p className="text-[10px] text-[#A3B1AA] mt-6 select-none font-sans uppercase tracking-widest">
            Rúben & Catarina • 14.06.2026
          </p>
        </motion.div>
      </div>
    );
  }

  // UI State: Welcome Splash Screen
  if (showWelcome) {
    return (
      <div className="flex-1 flex flex-col justify-between items-center px-6 py-6 select-none bg-gradient-to-b from-[#FAF9F5] to-white min-h-screen max-w-sm mx-auto w-full pb-16">
        
        {/* Top Header Section */}
        <div className="text-center w-full mt-2">
          <div className="flex justify-center mb-1">
            <span className="text-xl">🌿</span>
          </div>
          <p className="text-[9px] text-[#BF9B30] font-sans font-bold tracking-[0.2em] uppercase">
            Portal de Jogo
          </p>
          <h1 className="font-serif text-3xl font-light text-[#2F453A] mt-1.5 tracking-wide">
            Rúben & Catarina
          </h1>
          <p className="text-[10px] font-mono font-medium text-[#788A81] mt-1 uppercase tracking-widest">
            14 de Junho de 2026
          </p>
        </div>

        {/* Middle Welcome Greeting & DJ Ad Box Container */}
        <div className="w-full my-4 flex-1 flex flex-col justify-start space-y-4">
          {/* Main Greeting Row */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-[#E6E8E3] rounded-3xl p-5 text-center shadow-xs"
          >
            <h2 className="font-serif text-xl font-normal text-[#2F453A]">
              Bem-vindos à Mesa {mesa}!
            </h2>
            <p className="text-[11px] text-[#788A81] mt-1.5 font-sans leading-relaxed">
              Obrigado por estarem connosco neste dia único. Vamos jogar e celebrar juntos! 🎉📲
            </p>
          </motion.div>

          {/* PLAY AND TABLE DISCONECT ACTIONS - LOCATED PROMINENTLY ABOVE THE AD */}
          <div className="w-full space-y-2.5">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleVamosJogar}
              className="w-full py-4 bg-[#BF9B30] hover:bg-[#A68628] text-white rounded-2xl font-bold text-xs transition duration-200 shadow-md cursor-pointer flex items-center justify-center gap-2 select-none"
            >
              <span>Vamos Jogar! ➔</span>
            </motion.button>

            <button
              onClick={handleExit}
              className="w-full py-2.5 bg-[#FAF9F5] hover:bg-neutral-100 text-[#788A81] border border-[#E6E8E3] rounded-2xl font-semibold text-[10px] transition select-none cursor-pointer text-center"
            >
              Não sou da Mesa {mesa}? Desligar / Sair ✕
            </button>
          </div>

          {/* Official DJ Advertisement with increased size and clean circular crop - located gracefully at the bottom */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
            className="flex flex-col items-center justify-center pt-2 select-none w-full"
          >
            {/* Swan logo image container - perfectly round mask, enlarged, with absolute zero margins or backgrounds */}
            <div className="relative w-48 h-48 overflow-hidden rounded-full flex items-center justify-center bg-transparent border-0">
              <img 
                src={aveigaLogo} 
                alt="A. Veiga Casamentos Mágicos Logo"
                className="w-full h-full object-cover pointer-events-none transform scale-[1.12]"
                referrerPolicy="no-referrer"
              />
            </div>
            
            {/* Sponsor Label */}
            <span className="text-[9px] uppercase tracking-[0.2em] text-[#788A81] mt-3 font-semibold text-center">
              Animação & DJ Oficial do Casamento
            </span>
          </motion.div>
        </div>

        <p className="text-[8px] italic text-[#C5CBC6] mt-4 select-none uppercase tracking-wider">
          Obrigado por celebrar connosco! 🍀✨
        </p>
      </div>
    );
  }

  // UI State: Winners reveal celebration presentation is active
  if (quizState?.revealWinners) {
    // Compute rankings on guest side in real-time
    const tableRankings = Array.from({ length: 12 }, (_, i) => {
      const tableNum = i + 1;
      const tableAnswers = answers.filter((ans) => ans.tableNumber === tableNum);

      let correctCount = 0;
      let score = 0;
      let correctAnswersTime = 0;
      let totalAnswersSubmitted = tableAnswers.length;

      tableAnswers.forEach((ans) => {
        const qAnsKey = ans.questionId;
        const rightOp = quizState?.correctAnswers?.[qAnsKey];
        if (rightOp && ans.answer === rightOp) {
          correctCount += 1;
          score += 1; // 1 point per correct answer
          correctAnswersTime += (ans.timeTakenSecs || 0);
        }
      });

      return {
        tableNumber: tableNum,
        correctCount,
        score,
        correctAnswersTime,
        totalAnswersSubmitted,
      };
    });

    // Sort matching DJ's panel sorting rules
    tableRankings.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.score === 0) {
        return b.totalAnswersSubmitted - a.totalAnswersSubmitted;
      }
      if (a.correctAnswersTime !== b.correctAnswersTime) {
        return a.correctAnswersTime - b.correctAnswersTime;
      }
      return b.totalAnswersSubmitted - a.totalAnswersSubmitted;
    });

    const topThree = tableRankings.slice(0, 3).map((r) => r.tableNumber);
    const myRankIndex = tableRankings.findIndex((r) => r.tableNumber === mesa) + 1;
    const myRankObj = tableRankings.find((r) => r.tableNumber === mesa);
    const step = quizState.ceremonyStep || 3;

    return (
      <div className="flex-1 flex flex-col justify-start items-center px-4 py-8 select-none bg-gradient-to-b from-[#FAF9F5] to-white overflow-y-auto max-w-sm mx-auto w-full pb-16">
        
        {/* Header branding */}
        <div className="text-center mb-5 w-full">
          <span className="text-[9px] text-[#BF9B30] font-bold tracking-widest uppercase block animate-pulse">
            • Cerimónia de Resultados em Direto •
          </span>
          <h2 className="font-serif text-2xl text-[#2F453A] font-light mt-1">
            Rúben & Catarina
          </h2>
        </div>

        {/* 1. DJ reveal matches Step 3 */}
        {step === 3 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            key="step3"
            className="bg-white rounded-3xl p-6 border-2 border-[#E6C6AC] shadow-md w-full flex flex-col items-center relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-2 text-[8px] bg-[#E6C6AC]/20 text-[#A05C35] font-bold uppercase rounded-bl-xl">
              Pódio
            </div>
            <div className="w-16 h-16 bg-[#FAF9F5]/40 rounded-full border-2 border-[#E6C6AC] flex items-center justify-center mb-3 animate-bounce">
              <span className="text-3xl text-[#9A7B66]">🥉</span>
            </div>
            <span className="text-[9px] uppercase font-bold tracking-widest text-[#B36F45]">Terceiro Lugar 🥉</span>
            <h3 className="font-serif text-3xl font-normal text-[#2F453A] mt-2 mb-1">
              Mesa {topThree[2] || "--"}
            </h3>
            <p className="text-[10px] text-[#788A81] text-center max-w-[240px] mt-1 italic">
              "Grande prestação ao longo do jogo! Merecem uma enorme salva de palmas!" 👏
            </p>

            <div className="mt-5 w-full bg-slate-50 border border-slate-100 p-3 rounded-2xl flex items-center gap-2 justify-center">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span className="text-[10px] font-bold text-slate-500 font-sans uppercase tracking-wider">
                Aguardando 2º Lugar pelo DJ...
              </span>
            </div>
          </motion.div>
        )}

        {/* 2. DJ reveal matches Step 2 */}
        {step === 2 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            key="step2"
            className="w-full space-y-4"
          >
            {/* Second place bronze-silver card */}
            <div className="bg-white rounded-3xl p-6 border-2 border-slate-300 shadow-md flex flex-col items-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 text-[8px] bg-slate-100 text-slate-600 font-bold uppercase rounded-bl-xl">
                Pódio
              </div>
              <div className="w-16 h-16 bg-[#FAF9F5]/40 rounded-full border-2 border-slate-300 flex items-center justify-center mb-3 animate-bounce">
                <span className="text-3xl">🥈</span>
              </div>
              <span className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Segundo Lugar 🥈</span>
              <h3 className="font-serif text-3xl font-normal text-[#2F453A] mt-2 mb-1">
                Mesa {topThree[1] || "--"}
              </h3>
              <p className="text-[10px] text-[#788A81] text-center max-w-[240px] mt-1 italic">
                "Uau! Quase no topo! Respostas brilhantes e grande velocidade!" ✨🥈
              </p>
            </div>

            {/* Also show revealed 3rd place */}
            <div className="bg-white/80 border border-[#E6C6AC]/60 p-4 rounded-2xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-base">🥉</span>
                <span className="font-bold text-[#2F453A]">3º Lugar: Mesa {topThree[2]}</span>
              </div>
              <span className="text-[10px] text-[#A05C35] font-bold bg-[#E6C6AC]/10 border border-[#E6C6AC]/30 px-2 py-0.5 rounded-lg">
                {tableRankings[2]?.score} Acertos
              </span>
            </div>

            <div className="w-full bg-slate-50 border border-slate-100 p-3 rounded-2xl flex items-center gap-2 justify-center">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span className="text-[10px] font-bold text-slate-500 font-sans uppercase tracking-wider">
                Aguardando GRANDE VENCEDOR...
              </span>
            </div>
          </motion.div>
        )}

        {/* 3. DJ reveals Step 1 (Final Winners with active table scores and complete scrollable leaderboard!) */}
        {step === 1 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            key="step1"
            className="w-full space-y-4"
          >
            {/* First Place celebration card */}
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-3xl p-6 text-white text-center shadow-lg relative overflow-hidden flex flex-col items-center">
              <div className="absolute inset-0 pointer-events-none opacity-45 bg-[radial-[circle_at_top]] from-white/20 to-transparent"></div>
              
              <div className="w-18 h-18 bg-white/10 rounded-full border-2 border-amber-300 shadow-2xl flex items-center justify-center mb-3 animate-ping duration-[3000ms] relative">
                <span className="text-4xl absolute">🏆</span>
                <div className="w-18 h-18 rounded-full border border-white/25 absolute animate-spin"></div>
              </div>
              <span className="text-[9px] uppercase font-bold tracking-widest text-[#FFF3CD]">🥇 GRANDE VENCEDOR 🥇</span>
              <h3 className="font-serif text-4xl font-extrabold text-white mt-2 mb-1.5 drop-shadow-xs">
                Mesa {topThree[0] || "--"}
              </h3>
              <p className="text-[10.5px] text-amber-50/90 text-center max-w-[240px] leading-relaxed">
                "Os maiores campeões e intelectuais da noite! Conseguiram a pontuação mais gloriosa!" 🍾✨
              </p>
            </div>

            {/* Full Podium Overview */}
            <div className="bg-white border border-[#E6E8E3] rounded-3xl p-4.5 space-y-3 shadow-xs">
              <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400 block text-left">Pódio do Casamento</span>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs bg-amber-50/70 border border-amber-100 p-2.5 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🥇</span>
                    <span className="font-bold text-[#2F453A]">1º Lugar: Mesa {topThree[0]}</span>
                  </div>
                  <span className="font-bold text-[#BF9B30]">
                    {tableRankings[0]?.score} Acertos
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🥈</span>
                    <span className="font-bold text-[#2F453A]">2º Lugar: Mesa {topThree[1]}</span>
                  </div>
                  <span className="font-bold text-slate-500">
                    {tableRankings[1]?.score} Acertos
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs bg-[#FAF9F5]/40 border border-[#E6C6AC]/15 p-2.5 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🥉</span>
                    <span className="font-bold text-[#2F453A]">3º Lugar: Mesa {topThree[2]}</span>
                  </div>
                  <span className="font-bold text-[#A37B5C]">
                    {tableRankings[2]?.score} Acertos
                  </span>
                </div>
              </div>
            </div>

            {/* 4. Guest's Personal Standing Box */}
            <div className="bg-[#FAF9F5] border-2 border-dashed border-[#BF9B30]/40 rounded-3xl p-5 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-[#BF9B30] to-amber-400"></div>
              
              <span className="text-[9px] uppercase font-mono font-bold text-[#BF9B30] tracking-widest">
                🌟 Os Vossos Resultados 🌟
              </span>
              <h4 className="font-serif text-lg text-[#2F453A] mt-1.5">
                Mesa {mesa}
              </h4>
              
              <div className="grid grid-cols-2 gap-3 mt-4 text-left">
                <div className="bg-white border border-[#E6E8E3] rounded-2xl p-3.5 flex flex-col">
                  <span className="text-[8px] uppercase tracking-wider font-bold text-[#788A81]">Classificação</span>
                  <span className="text-xl font-bold font-serif text-[#2F453A] mt-1 inline-flex items-baseline">
                    {myRankIndex}º <span className="text-xs font-normal text-[#788A81]">/12</span>
                  </span>
                </div>

                <div className="bg-white border border-[#E6E8E3] rounded-2xl p-3.5 flex flex-col">
                  <span className="text-[8px] uppercase tracking-wider font-bold text-[#788A81]">Respostas Certas</span>
                  <span className="text-xl font-bold font-serif text-emerald-600 mt-1 inline-flex items-baseline">
                    {myRankObj?.correctCount || 0} <span className="text-xs font-normal text-[#788A81]">acertos</span>
                  </span>
                </div>
              </div>

              <p className="text-[10px] text-[#788A81] leading-relaxed mt-4">
                Completaram o quiz em um tempo total de <b className="text-[#2F453A] font-mono">{myRankObj?.correctAnswersTime || 0} s</b> para as respostas corretas! 🎉
              </p>
            </div>

            {/* 5. Complete Scrollable Leaderboard of all tables */}
            <div className="bg-white border border-[#E6E8E3] rounded-3xl p-4 shadow-xs">
              <span className="text-[9.5px] uppercase font-bold text-[#2F453A] tracking-wider block text-left mb-3">Tabela Geral de Classificações</span>
              
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {tableRankings.map((rank, idx) => {
                  const isCurrent = rank.tableNumber === mesa;
                  const borderCls = isCurrent ? "border-amber-400 bg-amber-50/50" : "border-[#E8EAE4] bg-white";
                  return (
                    <div key={idx} className={`flex justify-between items-center text-xs p-2 border rounded-xl ${borderCls}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[9px] ${
                          idx === 0 
                            ? "bg-amber-100 text-[#BF9B30]" 
                            : isCurrent 
                            ? "bg-amber-250 text-[#7A6B3D]" 
                            : "bg-[#4A5D4E]/10 text-[#4A5D4E]"
                        }`}>
                          {idx + 1}º
                        </span>
                        <span className={`font-medium ${isCurrent ? "font-bold text-[#2F453A]" : "text-slate-600"}`}>
                          Mesa {rank.tableNumber} {isCurrent && "📍 (Sua)"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 text-[9.5px]">
                        <span className="text-[#788A81]">{rank.correctCount} certas</span>
                        <span className="font-bold text-[#BF9B30] bg-[#FAF9F5] border border-amber-100 px-1.5 py-0.5 rounded">
                          {rank.score} pts
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-[9px] italic text-[#A3B1AA] text-center pt-2 select-none">
              Obrigado pelas vossas contribuições e por jogarem! 🥂🌿
            </p>
          </motion.div>
        )}

      </div>
    );
  }

  // UI State: Scan Landing - Bem-vindos Mesa X greeting
  // We'll show this automatically before they proceed, or make it integrated perfectly!
  return (
    <div className="flex-1 max-w-md mx-auto w-full px-4 py-6 flex flex-col justify-between select-none">
      
      {/* Quiz Progress Header Banner */}
      <div className="bg-white border border-[#E6E8E3] rounded-3xl px-5 py-4.5 shadow-xs flex items-center justify-between mb-4">
        <div className="flex flex-col text-left">
          <span className="text-[10px] text-[#BF9B30] font-bold uppercase tracking-wider flex items-center gap-1">
            <span>🌿</span>
            <span>Bem-vindos Mesa {mesa}</span>
          </span>
          <span className="font-serif text-lg text-[#2F453A] mt-0.5">
            Pergunta {currentQNum}
          </span>
        </div>

        {/* Dynamic Countdown Circle display */}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold font-mono tracking-wide ${
          timeLeft !== null && timeLeft <= 10 
            ? "bg-red-50 text-red-600 border-red-200 animate-pulse" 
            : "bg-[#F4F6F2] text-[#2F453A] border-[#E6E8E3]"
        }`}>
          {quizState?.status === "idle" ? (
            <>
              <Clock className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
              <span>ESPERA</span>
            </>
          ) : quizState?.status === "ended" ? (
            <>
              <Clock className="w-3.5 h-3.5 text-red-500" />
              <span>FIM</span>
            </>
          ) : timeLeft !== null ? (
            <>
              <Timer className="w-3.5 h-3.5 shrink-0" />
              <span>{String(timeLeft).padStart(2, "0")}s</span>
            </>
          ) : (
            <>
              <Hourglass className="w-3.5 h-3.5 animate-spin" />
              <span>--</span>
            </>
          )}
        </div>
      </div>

      {/* Main Options interactive board card */}
      <div className="flex-1 flex flex-col justify-center py-4">
        <motion.div 
          key={currentQId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-[#E6E8E3] rounded-3xl p-6 shadow-xs flex flex-col mb-4"
        >
          <div className="flex justify-center mb-3">
            <Heart className="w-5 h-5 text-[#BF9B30]/30 fill-[#BF9B30]/5" />
          </div>
          <h3 className="font-serif text-xl text-[#2F453A] text-center font-normal tracking-wide leading-relaxed mb-6">
            Qual é a Opção Correta?
          </h3>

          <div className="space-y-3 font-sans">
            {[
              { key: "A", label: "Opção A" },
              { key: "B", label: "Opção B" },
              { key: "C", label: "Opção C" },
            ].map((option) => {
              const op = option.key as "A" | "B" | "C";
              const isSelected = selectedOption === op;
              let btnClass = "bg-[#FAF9F5] border-[#E6E8E3] text-[#2F453A] hover:bg-[#F4F6F2]";
              
              if (isSelected) {
                btnClass = "bg-[#4A5D4E] border-[#4A5D4E] text-white shadow-sm";
              } else if (isSubmissionBlocked) {
                btnClass = "bg-neutral-50 border-neutral-200 text-neutral-400 opacity-70 cursor-not-allowed";
              }

              return (
                <button
                  key={op}
                  disabled={isSubmissionBlocked}
                  onClick={() => setSelectedOption(op)}
                  className={`w-full py-4 px-5 rounded-2xl border text-left text-xs font-bold cursor-pointer transition-all duration-200 flex items-center justify-between ${btnClass}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-lg text-[10px] font-bold flex items-center justify-center ${
                      isSelected ? "bg-white/20 text-white" : "bg-white border border-[#E6E8E3] text-[#788A81]"
                    }`}>
                      {op}
                    </span>
                    <span>{option.label}</span>
                  </div>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-white shrink-0" />}
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Synchronized Action Panel */}
      <div className="mt-2 text-center">
        {isSubmitted ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-5 bg-emerald-50 border border-emerald-200 rounded-3xl flex flex-col items-center gap-1.5"
          >
            <CheckCircle2 className="w-7 h-7 text-emerald-600 mb-0.5" />
            <h4 className="text-xs font-bold text-emerald-800">✅ Resposta registada</h4>
            <p className="text-[10px] text-emerald-600">A aguardar próxima pergunta pelo DJ...</p>
          </motion.div>
        ) : isTimeOver || quizState?.status === "ended" ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-5 bg-red-50 border border-red-200 rounded-3xl flex flex-col items-center gap-1"
          >
            <Timer className="w-7 h-7 text-red-500 mb-0.5 animate-pulse" />
            <h4 className="text-xs font-bold text-red-800">⏱️ Tempo terminado!</h4>
            <p className="text-[10px] text-red-600">Respostas bloqueadas pelo DJ. Aguarde a próxima pergunta.</p>
          </motion.div>
        ) : quizState?.status === "idle" ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-5 bg-amber-50 border border-amber-200 rounded-3xl flex flex-col items-center gap-1.5"
          >
            <Timer className="w-7 h-7 text-amber-500 mb-0.5 animate-pulse" />
            <h4 className="text-xs font-bold text-amber-800">Contador em Espera</h4>
            <p className="text-[10px] text-[#7A6B3D]">O DJ irá iniciar o contador para poder responder brevemente!</p>
          </motion.div>
        ) : (
          <button
            disabled={!selectedOption || submitting}
            onClick={handleConfirmAnswer}
            className={`w-full py-4 rounded-2xl font-bold text-xs transition shadow-xs text-center cursor-pointer ${
              selectedOption && !submitting
                ? "bg-[#BF9B30] hover:bg-[#A68628] text-white active:scale-[0.99]"
                : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
            }`}
          >
            {submitting ? "A enviar..." : "Confirmar Resposta"}
          </button>
        )}
      </div>

      {/* Subtle sponsor footer link */}
      <div className="mt-6 pt-3 border-t border-neutral-105/65 pb-8 flex items-center justify-center gap-1 text-[9.5px] text-neutral-400 select-none">
        <span>Animação & DJ Oficial por </span>
        <button
          onClick={() => setShowWelcome(true)}
          className="text-[#BF9B30] hover:underline font-bold transition duration-200"
        >
          A. Veiga Casamentos Mágicos
        </button>
      </div>

    </div>
  );
}
