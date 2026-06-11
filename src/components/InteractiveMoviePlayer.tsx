/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, Volume2, VolumeX, X, RotateCcw, Sparkles, Volume1, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export interface StoredMemory {
  eventName: string;
  eventDate: string;
  generatedAt: number;
  musicType: "none" | "synth" | "piano" | "guitar" | "custom";
  customMusicName?: string;
  customMusicBase64?: string;
  photos: {
    id: string;
    imageUrl: string;
    author: string;
    likesCount: number;
    category: string;
    favorite: boolean;
    createdAtMs: number;
  }[];
  writtenMessages: {
    id: string;
    author: string;
    text: string;
    createdAtMs: number;
  }[];
  voiceMessages: {
    id: string;
    author: string;
    audioUrl: string;
    duration?: number;
    createdAtMs: number;
  }[];
  movieUrl?: string;
  movieGeneratedAt?: number;
}

interface InteractiveMoviePlayerProps {
  memory: StoredMemory;
  onClose: () => void;
}

interface MovieSlide {
  id: string;
  type: "title" | "photo" | "message" | "end";
  duration: number; // seconds
  imgUrl?: string;
  author?: string;
  text?: string;
  likes?: number;
  favorite?: boolean;
  voiceToPlay?: {
    author: string;
    audioUrl: string;
  };
}

export default function InteractiveMoviePlayer({ memory, onClose }: InteractiveMoviePlayerProps) {
  const [slides, setSlides] = useState<MovieSlide[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [activeVoicePlaying, setActiveVoicePlaying] = useState<string | null>(null);

  // Audio References
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const slideTimeoutRef = useRef<any>(null);
  const slideStartTimeRef = useRef<number>(0);
  const [remainingTimeForSlide, setRemainingTimeForSlide] = useState<number>(0);

  // 1. Compile Slides on Load
  useEffect(() => {
    const photos = [...memory.photos]
      .sort((a, b) => b.createdAtMs - a.createdAtMs); // Use top 15 photos
    const written = [...memory.writtenMessages]
      .sort((a, b) => b.createdAtMs - a.createdAtMs); // Top 8 messages
    const voices = [...memory.voiceMessages]
      .sort((a, b) => b.createdAtMs - a.createdAtMs); // Max 5 voice notes

    const compiledSlides: MovieSlide[] = [];

    // Title slide
    compiledSlides.push({
      id: "slide_title",
      type: "title",
      duration: 6,
    });

    // Interleave
    let photoIdx = 0;
    let textIdx = 0;
    let voiceIdx = 0;

    while (photoIdx < photos.length || textIdx < written.length) {
      // Add up to 2 photos
      for (let c = 0; c < 2 && photoIdx < photos.length; c++) {
        const photo = photos[photoIdx];
        
        // Allocate current voice note to play over this photo if possible
        let voiceToPlayVal = undefined;
        if (voiceIdx < voices.length) {
          voiceToPlayVal = {
            author: voices[voiceIdx].author,
            audioUrl: voices[voiceIdx].audioUrl,
          };
          voiceIdx++;
        }

        compiledSlides.push({
          id: `slide_photo_${photo.id}_${photoIdx}`,
          type: "photo",
          duration: 5.5,
          imgUrl: photo.imageUrl,
          author: photo.author,
          likes: photo.likesCount,
          favorite: !!photo.favorite,
          voiceToPlay: voiceToPlayVal,
        });
        photoIdx++;
      }

      // Add 1 written response text
      if (textIdx < written.length) {
        const msg = written[textIdx];
        compiledSlides.push({
          id: `slide_msg_${msg.id}_${textIdx}`,
          type: "message",
          duration: 6.5,
          author: msg.author,
          text: msg.text,
        });
        textIdx++;
      }
    }

    // End Slide
    compiledSlides.push({
      id: "slide_end",
      type: "end",
      duration: 5,
    });

    setSlides(compiledSlides);
    setCurrentSlideIndex(0);
    setIsPlaying(true);
  }, [memory]);

  // Handle ambient background music stream setup
  useEffect(() => {
    if (bgAudioRef.current) {
      bgAudioRef.current.pause();
      bgAudioRef.current = null;
    }

    let musicSource = "https://ceenaija.com/wp-content/uploads/2021/04/Calum_Scott_-_You_Are_The_Reason_CeeNaija.com_.mp3";
    let volumeLevel = 0.35;

    if (memory.musicType === "custom" && memory.customMusicBase64) {
      musicSource = memory.customMusicBase64;
    } else if (memory.musicType === "piano") {
      musicSource = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
    } else if (memory.musicType === "guitar") {
      musicSource = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3";
    } else if (memory.musicType === "synth") {
      musicSource = "https://ceenaija.com/wp-content/uploads/2021/04/Calum_Scott_-_You_Are_The_Reason_CeeNaija.com_.mp3";
    } else if (memory.musicType === "none") {
      volumeLevel = 0;
    }

    const audio = new Audio(musicSource);
    audio.loop = true;
    audio.volume = isAudioMuted ? 0 : volumeLevel;
    bgAudioRef.current = audio;

    // Direct cascade safety
    audio.onerror = () => {
      console.warn("Failed to stream theme track, loading backup piano track...");
      audio.src = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
      if (isPlaying) {
        audio.play().catch((err) => console.log("Silent fallback fail:", err));
      }
    };

    if (isPlaying) {
      audio.play().catch((e) => console.warn("Failed background play:", e));
    }

    return () => {
      if (bgAudioRef.current) {
        bgAudioRef.current.pause();
        bgAudioRef.current = null;
      }
    };
  }, [memory, isPlaying, isAudioMuted]);

  // Audio Control helpers
  const duckBackgroundAudio = (ducked: boolean) => {
    if (!bgAudioRef.current) return;
    const standardVolume = 0.35;
    if (ducked) {
      bgAudioRef.current.volume = isAudioMuted ? 0 : 0.05; // Drop background track volume
    } else {
      bgAudioRef.current.volume = isAudioMuted ? 0 : standardVolume; // Restore
    }
  };

  // Manage individual slide transition timeline
  useEffect(() => {
    if (slides.length === 0) return;

    // Check if the current slide has a voice message to trigger
    const activeSlide = slides[currentSlideIndex];
    
    // Stop any active pre-existing voice notes before starting new slide
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause();
      voiceAudioRef.current = null;
      setActiveVoicePlaying(null);
      duckBackgroundAudio(false);
    }

    if (activeSlide?.voiceToPlay && isPlaying) {
      const voiceData = activeSlide.voiceToPlay;
      setActiveVoicePlaying(voiceData.author);
      duckBackgroundAudio(true);

      const voiceAudio = new Audio(voiceData.audioUrl);
      voiceAudioRef.current = voiceAudio;
      voiceAudio.volume = isAudioMuted ? 0 : 1.0;
      voiceAudio.play().catch((e) => console.warn("Voice message fail play:", e));

      voiceAudio.onended = () => {
        setActiveVoicePlaying(null);
        duckBackgroundAudio(false);
      };
    }

    // Set slide timer
    if (isPlaying) {
      const currentDuration = remainingTimeForSlide > 0 ? remainingTimeForSlide : (activeSlide?.duration || 5);
      slideStartTimeRef.current = Date.now();
      setRemainingTimeForSlide(0);

      slideTimeoutRef.current = setTimeout(() => {
        if (currentSlideIndex < slides.length - 1) {
          setCurrentSlideIndex((prevIdx) => prevIdx + 1);
        } else {
          // Loop back automatically and continue playing
          setCurrentSlideIndex(0);
        }
      }, currentDuration * 1000);
    }

    return () => {
      if (slideTimeoutRef.current) {
        clearTimeout(slideTimeoutRef.current);
      }
    };
  }, [currentSlideIndex, isPlaying, slides]);

  // React to play/pause state
  const handleTogglePlay = () => {
    if (isPlaying) {
      // Pause
      if (slideTimeoutRef.current) {
        clearTimeout(slideTimeoutRef.current);
      }
      // Calculate how much time remained on current slide
      const elapsed = (Date.now() - slideStartTimeRef.current) / 1000;
      const originalDuration = slides[currentSlideIndex]?.duration || 5;
      setRemainingTimeForSlide(Math.max(0.5, originalDuration - elapsed));

      if (bgAudioRef.current) bgAudioRef.current.pause();
      if (voiceAudioRef.current) voiceAudioRef.current.pause();
      setIsPlaying(false);
    } else {
      // Resume
      setIsPlaying(true);
      if (bgAudioRef.current && memory.musicType !== "none") {
        bgAudioRef.current.play().catch(console.warn);
      }
      if (voiceAudioRef.current) {
        voiceAudioRef.current.play().catch(console.warn);
      }
    }
  };

  // Mute toggle handle
  const handleToggleMute = () => {
    const nextMuted = !isAudioMuted;
    setIsAudioMuted(nextMuted);

    if (bgAudioRef.current) {
      const standardVolume = 0.35;
      const isDucked = !!activeVoicePlaying;
      bgAudioRef.current.volume = nextMuted ? 0 : (isDucked ? 0.05 : standardVolume);
    }
    if (voiceAudioRef.current) {
      voiceAudioRef.current.volume = nextMuted ? 0 : 1.0;
    }
  };

  // Skip manually
  const handleNextSlide = () => {
    setRemainingTimeForSlide(0);
    if (currentSlideIndex < slides.length - 1) {
      setCurrentSlideIndex((prev) => prev + 1);
    } else {
      setCurrentSlideIndex(0);
    }
  };

  const handlePrevSlide = () => {
    setRemainingTimeForSlide(0);
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex((prev) => prev - 1);
    } else {
      setCurrentSlideIndex(slides.length - 1);
    }
  };

  const handleRestart = () => {
    setRemainingTimeForSlide(0);
    setCurrentSlideIndex(0);
    setIsPlaying(true);
    if (bgAudioRef.current) {
      bgAudioRef.current.currentTime = 0;
    }
  };

  const activeSlide = slides[currentSlideIndex];
  const progressRatio = slides.length > 0 ? ((currentSlideIndex + 1) / slides.length) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-[#0C120E] z-50 overflow-hidden flex flex-col justify-between font-sans text-white select-none">
      
      {/* 1. Header controls overlay */}
      <div className="px-6 py-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-20">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎬</span>
          <div className="text-left">
            <h1 className="text-xs font-bold uppercase tracking-widest text-[#BF9B30]">Cinema Interativo</h1>
            <p className="text-[9px] text-[#A6C4B4] uppercase">Recordação de Rúben & Catarina</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mute toggle button */}
          <button
            onClick={handleToggleMute}
            className="p-2.5 bg-white/10 hover:bg-white/20 active:scale-[0.95] rounded-full border border-white/10 transition cursor-pointer"
            title={isAudioMuted ? "Ligar som" : "Silenciar"}
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
          </button>

          {/* Close button */}
          <button
            onClick={() => {
              if (bgAudioRef.current) bgAudioRef.current.pause();
              if (voiceAudioRef.current) voiceAudioRef.current.pause();
              onClose();
            }}
            className="p-2.5 bg-white/10 hover:bg-white/20 active:scale-[0.95] rounded-full border border-white/10 transition cursor-pointer"
            title="Sair do cinema"
          >
            <X className="w-4 h-4 text-stone-200" />
          </button>
        </div>
      </div>

      {/* 2. Main screen center showcase */}
      <div className="flex-1 w-full flex items-center justify-center relative p-6 mt-16 mb-20">
        
        {/* Subtle decorative gold inner border margin and dim glow */}
        <div className="absolute inset-4 sm:inset-8 border border-[#BF9B30]/20 rounded-2xl pointer-events-none z-10" />

        <div className="w-full max-w-4xl aspect-video relative rounded-xl overflow-hidden bg-black/40 flex items-center justify-center border border-stone-800">
          
          <AnimatePresence mode="wait">
            {activeSlide && (
              <motion.div
                key={activeSlide.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8 }}
                className="w-full h-full absolute inset-0 flex flex-col items-center justify-center"
              >
                
                {/* A. TITLE SLIDE */}
                {activeSlide.type === "title" && (
                  <div className="text-center space-y-4 px-6 max-w-lg z-10">
                    <motion.span 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.3, duration: 1.2 }}
                      className="text-[9px] uppercase tracking-[0.25em] text-[#BF9B30] block font-semibold"
                    >
                      Boda Memorável
                    </motion.span>
                    <motion.h2 
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.6, duration: 1.2 }}
                      className="font-serif italic text-4xl sm:text-6xl text-white tracking-wide"
                    >
                      Rúben & Catarina
                    </motion.h2>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1.1, duration: 1 }}
                      className="w-16 h-[1px] bg-amber-500/30 mx-auto my-4" 
                    />
                    <motion.p 
                      initial={{ y: -10, opacity: 0 }}
                      animate={{ y: 0, opacity: 0.8 }}
                      transition={{ delay: 1.3, duration: 1 }}
                      className="text-[11px] sm:text-xs tracking-wider text-stone-300 font-sans uppercase font-medium"
                    >
                      O Filme das Nossas Memórias
                    </motion.p>
                    <motion.p 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.5 }}
                      transition={{ delay: 1.6, duration: 1 }}
                      className="text-[9px] italic text-stone-400 font-serif"
                    >
                      Compilação Exclusiva de Boda • 14 Junho 2026
                    </motion.p>
                  </div>
                )}

                {/* B. PHOTO SLIDE (Ken Burns dynamic scale effect) */}
                {activeSlide.type === "photo" && activeSlide.imgUrl && (
                  <div className="w-full h-full relative overflow-hidden flex items-center justify-center p-4">
                    {/* Ken Burns zooming photo frame */}
                    <div className="w-full h-full absolute inset-0 sm:inset-4 overflow-hidden rounded-lg sm:rounded-xl border border-stone-800 shadow-2xl flex items-center justify-center">
                      <motion.img
                        src={activeSlide.imgUrl}
                        alt="Aesthetic wedding perspective"
                        initial={{ scale: 1.0, x: -10, y: -5 }}
                        animate={{ scale: 1.08, x: 10, y: 5 }}
                        transition={{ duration: 5.5, ease: "linear" }}
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    {/* Bottom information pill overlays */}
                    <div className="absolute bottom-6 left-6 right-6 sm:bottom-10 sm:left-10 sm:right-10 z-10 flex flex-col gap-2 max-w-xl text-left bg-gradient-to-t from-black/90 via-black/70 to-transparent p-4 rounded-xl">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs sm:text-sm font-bold text-white shadow-xs">
                          Partilhada por: <span className="text-amber-400 italic font-serif text-sm sm:text-base">{activeSlide.author || "Convidado"}</span>
                        </span>
                        
                        {activeSlide.favorite && (
                          <span className="text-[8px] sm:text-[9px] bg-amber-500/90 text-black px-2.5 py-0.5 rounded-full uppercase font-bold tracking-wider flex items-center gap-1 shrink-0">
                            ★ Favorito dos Noivos
                          </span>
                        )}
                      </div>
                      
                      <div className="text-[10px] text-stone-300 flex items-center gap-2">
                        <span className="text-rose-400">❤</span>
                        <span>{activeSlide.likes || 0} gostos da plateia</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* C. GUEST MESSAGE VOW CARD */}
                {activeSlide.type === "message" && (
                  <div className="w-full max-w-lg mx-auto p-6 sm:p-12 z-10 text-center space-y-6">
                    <motion.div 
                      key={activeSlide.id + "_card"}
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.8 }}
                      className="bg-white/95 text-stone-900 rounded-3xl p-6 sm:p-10 shadow-2xl relative border-t-4 border-[#BF9B30] flex flex-col items-center gap-4 text-center"
                    >
                      <span className="text-3xl text-amber-500 block mb-2">✍️</span>
                      
                      <span className="text-[9px] text-[#788A81] font-bold uppercase tracking-widest block">
                        Dedicatória de {activeSlide.author || "Convidado"}
                      </span>

                      <p className="font-serif italic text-base sm:text-lg text-[#2F453A] leading-relaxed max-w-sm">
                        "{activeSlide.text || "Votos eternos de felicidade ao casal!"}"
                      </p>

                      <div className="w-10 h-[1.5px] bg-[#BF9B30]/40 mt-2" />
                    </motion.div>
                  </div>
                )}

                {/* D. ENDING SLIDE */}
                {activeSlide.type === "end" && (
                  <div className="text-center space-y-4 px-6 max-w-md z-10">
                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.3, duration: 1.2 }}
                      className="text-4xl block mb-2"
                    >
                      💍
                    </motion.div>
                    <motion.h3 
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.6, duration: 1.2 }}
                      className="font-serif italic text-3xl sm:text-4px text-white"
                    >
                      E assim começa
                    </motion.h3>
                    <motion.p 
                      initial={{ y: 10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.9, duration: 1.2 }}
                      className="font-serif italic text-lg sm:text-xl text-stone-300"
                    >
                      a nossa maior aventura...
                    </motion.p>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1.4, duration: 1 }}
                      className="w-16 h-[1px] bg-[#BF9B30]/30 mx-auto my-4" 
                    />
                    <motion.p 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.5 }}
                      transition={{ delay: 1.7, duration: 0.8 }}
                      className="text-[9px] tracking-widest text-[#BF9B30] font-sans uppercase font-bold"
                    >
                      M O M E N T I A   💎   2 0 2 6
                    </motion.p>
                  </div>
                )}

              </motion.div>
            )}
          </AnimatePresence>

          {/* Voice overlay indicator */}
          {activeVoicePlaying && (
            <motion.div 
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              className="absolute bottom-4 left-4 z-30 bg-amber-500/90 text-stone-900 border border-amber-400 py-1.5 px-3 rounded-full text-[10px] sm:text-xs font-bold shadow-lg flex items-center gap-2"
            >
              <div className="flex gap-0.5 items-end justify-center h-3 w-3 select-none">
                <span className="w-0.5 bg-stone-900 animate-pulse h-1 bg-gradient-to-t" style={{ animationDuration: "0.5s" }} />
                <span className="w-0.5 bg-stone-900 animate-pulse h-3 bg-gradient-to-t" style={{ animationDuration: "0.8s" }} />
                <span className="w-0.5 bg-[#423101] animate-pulse h-2 bg-gradient-to-t" style={{ animationDuration: "0.6s" }} />
                <span className="w-0.5 bg-stone-900 animate-pulse h-3.5 bg-gradient-to-t animate-bounce" />
              </div>
              <span className="tracking-wide">🎤 Mensagem de voz de: <b className="font-extrabold uppercase">{activeVoicePlaying}</b></span>
            </motion.div>
          )}

        </div>
      </div>

      {/* 3. Bottom controls toolbar */}
      <div className="px-6 py-5 bg-gradient-to-t from-black/90 to-transparent absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-3">
        
        {/* Timeline indicator tracker */}
        <div className="w-full max-w-lg flex items-center justify-between gap-3 text-[10px]">
          <span className="text-stone-400 font-mono">01 / {slides.length.toString().padStart(2, '0')}</span>
          
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden relative">
            <div 
              className="h-full bg-[#BF9B30]/95 absolute left-0 top-0 transition-all duration-300 rounded-full" 
              style={{ width: `${progressRatio}%` }} 
            />
          </div>

          <span className="text-[#BF9B30] font-mono font-bold">Slide {currentSlideIndex + 1}</span>
        </div>

        {/* Play playback cluster controls */}
        <div className="flex items-center gap-4 sm:gap-6">
          <button
            onClick={handlePrevSlide}
            className="p-2 sm:p-2.5 text-stone-400 hover:text-white hover:bg-white/10 transition rounded-full cursor-pointer active:scale-90"
            title="Slide anterior"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <button
            onClick={handleRestart}
            className="p-2 sm:p-2.5 text-stone-400 hover:text-white hover:bg-white/10 transition rounded-full cursor-pointer active:scale-90"
            title="Reiniciar filme"
          >
            <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* Primary play toggle */}
          <button
            onClick={handleTogglePlay}
            className="p-4 sm:p-5 bg-[#BF9B30] text-black hover:bg-amber-400 active:scale-[0.93] transition rounded-full cursor-pointer shadow-lg hover:shadow-amber-500/10 flex items-center justify-center border border-amber-300"
            title={isPlaying ? "Pausar" : "Reproduzir"}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 sm:w-6 sm:h-6 text-stone-900 fill-current" />
            ) : (
              <Play className="w-5 h-5 sm:w-6 sm:h-6 text-stone-900 fill-current ml-0.5" />
            )}
          </button>

          <div
            className="p-2 sm:p-2.5 text-stone-400"
            title="Efeitos automáticos"
          >
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500/80 animate-pulse" />
          </div>

          <button
            onClick={handleNextSlide}
            className="p-2 sm:p-2.5 text-stone-400 hover:text-white hover:bg-white/10 transition rounded-full cursor-pointer active:scale-90"
            title="Slide seguinte"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

      </div>

    </div>
  );
}
