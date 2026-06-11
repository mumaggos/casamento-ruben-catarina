import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Lock, Heart, Sparkles, Delete, KeyRound, AlertCircle } from "lucide-react";

interface WeddingPasscodeScreenProps {
  onCorrectPasscode: () => void;
}

export default function WeddingPasscodeScreen({ onCorrectPasscode }: WeddingPasscodeScreenProps) {
  const [pin, setPin] = useState<string>("");
  const [errorStatus, setErrorStatus] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState<boolean>(false);

  const CORRECT_PIN = "1406";

  const handleDigit = (digit: string) => {
    if (success || pin.length >= 4) return;
    setErrorStatus(false);
    const nextPin = pin + digit;
    setPin(nextPin);
  };

  const handleBackspace = () => {
    if (success || pin.length === 0) return;
    setErrorStatus(false);
    setPin(pin.slice(0, -1));
  };

  const handleClear = () => {
    if (success) return;
    setErrorStatus(false);
    setPin("");
  };

  useEffect(() => {
    if (pin.length === 4) {
      if (pin === CORRECT_PIN) {
        setSuccess(true);
        setTimeout(() => {
          localStorage.setItem("wedding_access_authorized_v2", "true");
          onCorrectPasscode();
        }, 850);
      } else {
        // Shake feedback for incorrect guess
        setIsShaking(true);
        setErrorStatus(true);
        setTimeout(() => {
          setIsShaking(false);
          setPin(""); // Clear code after shaking
        }, 500);
      }
    }
  }, [pin, onCorrectPasscode]);

  // Support physical physical keyboards (desktop / tablets)
  useEffect(() => {
    const handlePhysicalKeys = (e: KeyboardEvent) => {
      if (success) return;
      if (e.key >= "0" && e.key <= "9") {
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        handleBackspace();
      } else if (e.key === "Escape" || e.key === "Delete") {
        handleClear();
      }
    };
    window.addEventListener("keydown", handlePhysicalKeys);
    return () => window.removeEventListener("keydown", handlePhysicalKeys);
  }, [pin, success]);

  return (
    <div className="min-h-screen bg-[#FAF9F5] flex flex-col font-sans relative overflow-hidden" id="passcode-screen-container">
      {/* Symmetrical luxury background pattern blooms */}
      <div className="absolute top-0 inset-x-0 pointer-events-none opacity-20 bg-radial-[circle_at_top] from-[#BF9B30]/30 to-transparent h-96"></div>
      
      {/* Absolute botanical side decor */}
      <div className="absolute -top-12 -left-12 text-5xl opacity-15 pointer-events-none select-none">🌿</div>
      <div className="absolute -bottom-10 -right-10 text-5xl opacity-15 pointer-events-none select-none rotate-180">🌿</div>

      <div className="w-full max-w-md mx-auto bg-white flex flex-col justify-between min-h-screen shadow-lg border-x border-[#E6E8E3] px-6 py-10 relative z-10">
        
        {/* UPPER BRANDING */}
        <div className="text-center mt-3 flex flex-col items-center">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="w-12 h-12 bg-[#FAF9F5] rounded-full border border-amber-250 flex items-center justify-center mb-3"
          >
            <Heart className="w-5 h-5 text-[#BF9B30] fill-[#BF9B30]/10" />
          </motion.div>
          
          <span className="text-[10px] text-[#BF9B30] font-sans font-bold tracking-[0.25em] uppercase">
            Casamento de
          </span>
          <h1 className="font-serif text-3xl font-light text-[#2F453A] mt-1.5 tracking-wide">
            Rúben & Catarina
          </h1>
          <p className="text-[10.5px] font-mono font-medium text-[#788A81] tracking-widest mt-1 uppercase">
            14 de Junho de 2026
          </p>

          <div className="w-16 h-[1px] bg-amber-100 mt-4 mb-3"></div>
        </div>

        {/* MIDDLE CONTROL SCREEN (Pin codes & validation message) */}
        <div className="flex-1 flex flex-col justify-center items-center w-full">
          <div className="text-center max-w-[280px] mb-6">
            <h3 className="font-serif text-sm font-bold text-[#2F453A] flex items-center justify-center gap-1.5">
              <KeyRound className="w-4 h-4 text-[#BF9B30]" />
              Senha de Acesso Requerida
            </h3>
            <p className="text-[11px] text-[#788A81] leading-relaxed mt-1.5">
              Introduza os 4 dígitos fornecidos pelos noivos ou na decoração para desbloquear o portal do casamento.
            </p>
          </div>

          {/* Sizable shakeable PIN visualization bubble rows */}
          <motion.div 
            animate={isShaking ? { x: [-12, 12, -8, 8, -4, 4, 0] } : {}}
            transition={{ duration: 0.4 }}
            className="flex justify-center gap-6 my-4"
          >
            {[0, 1, 2, 3].map((index) => {
              const hasDigit = pin.length > index;
              return (
                <div 
                  key={index}
                  className={`w-4.5 h-4.5 rounded-full border-2 transition-all duration-150 ${
                    success 
                      ? "bg-emerald-500 border-emerald-500 scale-110" 
                      : errorStatus
                      ? "bg-red-500 border-red-500 scale-105"
                      : hasDigit
                      ? "bg-[#BF9B30] border-[#BF9B30] scale-105 shadow-xs"
                      : "border-neutral-300 bg-neutral-100"
                  }`}
                />
              );
            })}
          </motion.div>

          {/* Dynamic feedback strings */}
          <div className="min-h-6 flex items-center justify-center mt-2">
            <AnimatePresence mode="wait">
              {success ? (
                <motion.span 
                  key="success"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-xs font-semibold text-emerald-600 flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-spin" /> Entrada Autorizada! Bem-vindos! 🥂
                </motion.span>
              ) : errorStatus ? (
                <motion.span 
                  key="error"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-[11px] text-red-500 font-bold flex items-center gap-1"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Senha Incorreta. Tente novamente!
                </motion.span>
              ) : (
                <motion.span 
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.45 }}
                  className="text-[9.5px] uppercase font-mono tracking-wider text-slate-500"
                >
                  Dica: Dia / Mês do Casamento 📅
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* CUSTOM ROUNDED PASSCODE KEYPAD */}
        <div className="w-full max-w-[280px] mx-auto mt-auto mb-4">
          <div className="grid grid-cols-3 gap-y-3.5 gap-x-5.5 justify-items-center">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
              <motion.button
                key={num}
                whileTap={{ scale: 0.93 }}
                onClick={() => handleDigit(num)}
                className="w-14 h-14 bg-[#FAF9F5]/80 active:bg-[#BF9B30]/15 hover:bg-neutral-50 text-neutral-800 font-medium text-lg rounded-full border border-neutral-150 shadow-2xs transition flex items-center justify-center cursor-pointer select-none"
              >
                {num}
              </motion.button>
            ))}
            
            {/* Action buttons list */}
            <button
              onClick={handleClear}
              className="w-14 h-14 text-[10px] font-bold text-neutral-400 active:text-neutral-800 flex items-center justify-center select-none cursor-pointer"
            >
              LIMPAR
            </button>

            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => handleDigit("0")}
              className="w-14 h-14 bg-[#FAF9F5]/80 active:bg-[#BF9B30]/15 hover:bg-neutral-50 text-neutral-800 font-medium text-lg rounded-full border border-neutral-150 shadow-2xs transition flex items-center justify-center cursor-pointer select-none"
            >
              0
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={handleBackspace}
              className="w-14 h-14 bg-red-50/40 text-red-500 active:bg-red-100 rounded-full border border-red-100 shadow-2xs transition flex items-center justify-center cursor-pointer select-none"
            >
              <Delete className="w-4.5 h-4.5" />
            </motion.button>
          </div>
        </div>

        {/* FOOTER */}
        <div className="text-center mt-3">
          <p className="text-[8px] text-[#A3B1AA] uppercase tracking-widest select-none">
            Animação por A. Veiga Casamentos Mágicos 🎩🌿
          </p>
        </div>

      </div>
    </div>
  );
}
