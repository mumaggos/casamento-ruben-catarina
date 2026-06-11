/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { MapPin, Clock, Calendar, ArrowRight, Heart, Sparkles, User, Camera } from "lucide-react";
import weddingBannerBg from "../assets/images/wedding_banner_bg_1780087534155.png";
import { ActiveTab } from "../types";

interface LandingViewProps {
  onNavigate: (tab: ActiveTab) => void;
  guestName: string;
  setGuestName: (name: string) => void;
  onShowNameModal?: () => void;
}

export default function LandingView({ onNavigate, guestName, setGuestName }: LandingViewProps) {
  const weddingDate = new Date("2026-06-14T12:30:00").getTime();
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const difference = weddingDate - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [weddingDate]);

  const handleOpenMap = () => {
    window.open(
      "https://www.google.com/maps/search/?api=1&query=Quinta+dos+Jasmins+Rua+do+Barrimau+55+Ferreira+Pacos+de+Ferreira",
      "_blank"
    );
  };

  const handleSaveName = () => {
    if (nameInput.trim()) {
      setGuestName(nameInput.trim());
    }
  };

  return (
    <div className="flex flex-col items-center justify-between min-h-[calc(100vh-140px)] px-4 py-6 text-center">
      {/* Decorative Top Header Banner with stunning high-contrast wedding banner image visible in the background */}
      <div 
        className="w-full relative max-w-md bg-white rounded-3xl shadow-sm border border-[#E6E8E3] overflow-hidden mb-6 bg-cover bg-center"
        style={{ backgroundImage: `url(${weddingBannerBg})` }}
      >
        {/* Soft elegant overlay to guarantee text legibility while displaying the beautiful artwork behind */}
        <div className="absolute inset-0 bg-white/85"></div>

        <div className="p-6 relative text-center z-10">
          {/* Active Exclusive Badge */}
          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/60 text-[9px] text-[#556B2F] font-semibold tracking-wide flex items-center gap-1 shadow-xs select-none">
            <Sparkles className="w-2.5 h-2.5 text-[#BF9B30]" />
            <span>EXCLUSIVO DO CASAL</span>
          </div>

          <div className="flex justify-center mb-1.5 mt-4">
            <Heart className="text-[#BF9B30] fill-[#BF9B30]/15 w-6 h-6 animate-pulse" />
          </div>
          <h1 className="font-serif text-3xl md:text-4xl text-[#2F453A] font-light tracking-wide select-none">
            Rúben & Catarina
          </h1>
          <p className="font-sans text-[#788A81] tracking-widest text-xs uppercase mt-2">
            14 de Junho de 2026
          </p>
          <div className="h-[1px] w-1/4 bg-[#BF9B30]/30 mx-auto my-4"></div>
          <p className="font-serif italic text-lg text-[#556B2F] font-normal leading-relaxed">
            “Bem-vindos ao nosso dia 💍”
          </p>
        </div>
      </div>

      {/* Guest Name configuration option directly on Landing screen */}
      {!guestName ? (
        <div className="w-full max-w-md bg-[#FAF9F5] border border-[#BF9B30]/30 rounded-2xl p-5 text-left mb-6 relative overflow-hidden shadow-xs animate-fade-in">
          <div className="relative z-10">
            <h3 className="font-serif text-base text-[#2F453A] font-semibold flex items-center gap-2 mb-1.5">
              <Sparkles className="w-4 h-4 text-[#BF9B30]" />
              Identifique-se no Portal
            </h3>
            <p className="text-[11px] text-[#788A81] leading-relaxed mb-4.5">
              Introduza o seu nome para podermos saber quem adiciona fotos ao álbum, faz sugestões de música ou deixa bonitas mensagens de voz!
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ex: Tio João, Amigo Sérgio..."
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="flex-1 bg-white border border-[#C5CBC6] rounded-xl px-4 py-2.5 text-xs text-[#2F453A] focus:outline-hidden focus:ring-1 focus:ring-[#4A5D4E] focus:border-[#4A5D4E]"
              />
              <button
                onClick={handleSaveName}
                className="bg-[#4A5D4E] hover:bg-[#3E4F41] active:scale-95 text-white px-5 rounded-xl font-semibold text-xs transition"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md bg-[#F4F6F2] border border-[#E6E8E3] rounded-2xl px-4 py-3 text-xs text-[#788A81] flex justify-between items-center mb-6">
          <span className="flex items-center gap-1.5 font-medium">
            <User className="w-3.5 h-3.5 text-[#556B2F]" />
            Olá, <b className="text-[#2F453A]">{guestName}</b>! Bem-vindo ao nosso dia.
          </span>
          <button 
            onClick={() => {
              setNameInput("");
              setGuestName("");
            }} 
            className="text-[#BF9B30] hover:underline font-bold text-[10px]"
          >
            Alterar
          </button>
        </div>
      )}

      {/* Warm Celebratory Message Card (Replacing the Countdown) */}
      <div className="w-full max-w-md bg-gradient-to-r from-amber-50 to-[#FAF9F5] rounded-2xl p-5 border border-amber-200/60 shadow-xs mb-6 text-left animate-fade-in">
        <p className="text-xs text-amber-600 uppercase tracking-widest font-extrabold mb-1.5 flex items-center gap-1.5">
          <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500 animate-pulse" />
          Dia Muito Especial
        </p>
        <p className="font-sans text-xs text-[#2F453A] leading-relaxed font-semibold">
          Estamos imensamente felizes por vos ter connosco neste dia tão especial.
        </p>
        <p className="font-sans text-[11px] text-[#788A81] mt-1.5 leading-relaxed">
          Divirtam-se, criem memórias e desfrutem de cada instante connosco. ❤️
        </p>
      </div>

      {/* Main Big Button: Route to Party */}
      <div className="w-full max-w-md mb-6">
        <button
          onClick={handleOpenMap}
          className="w-full py-4 px-6 bg-[#4A5D4E] hover:bg-[#3E4F41] active:bg-[#2C382E] text-white rounded-2xl font-medium text-base shadow-md transition-all flex items-center justify-center gap-3 transform hover:-translate-y-[1px]"
          id="btn-route-quinta"
        >
          <span>👉 Ir para a Quinta dos Jasmins</span>
          <ArrowRight className="w-5 h-5" />
        </button>
        <p className="text-xs text-[#788A81] mt-2">
          Carregue aqui para obter o trajeto de GPS no Google Maps
        </p>
      </div>

      {/* Elegant & discrete guest photographer invitation card */}
      <div className="w-full max-w-md bg-white border border-[#E6E8E3] rounded-3xl p-5 text-left mb-6 shadow-2xs relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-[#FAF9F5] rounded-full -mr-10 -mt-10 transition-all duration-300 group-hover:scale-110" />
        <div className="relative z-10 flex gap-4">
          <div className="w-10 h-10 bg-[#FAF9F5] border border-[#BF9B30]/20 rounded-full flex items-center justify-center shrink-0">
            <Camera className="w-5 h-5 text-[#BF9B30]" />
          </div>
          <div className="flex-1">
            <h4 className="font-serif text-sm text-[#2F453A] font-bold mb-1.5 flex items-center gap-1">
              Guarde Connosco Estas Memórias
            </h4>
            <p className="font-sans text-[11px] text-[#788A81] leading-relaxed mb-3">
              Querido convidado, hoje não és apenas testemunha desta história — também fazes parte dela. Partilha as tuas fotografias e ajuda-nos a preservar os sorrisos, os abraços e os pequenos momentos que tornarão este dia inesquecível. 🤍💍
            </p>
            <button
              onClick={() => onNavigate("photos")}
              className="inline-flex items-center gap-1.5 text-xs text-[#BF9B30] hover:text-[#A68628] font-bold transition cursor-pointer"
            >
              <span>Partilhar Fotografias</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Essential Quick Info list */}
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#E6E8E3] p-5 shadow-xs text-left space-y-4 mb-4">
        <p className="text-sm font-semibold text-[#2F453A] uppercase tracking-wider mb-2 border-b border-[#F0F2EE] pb-2">
          Programação do Dia
        </p>
        
        <div className="flex items-start gap-3.5">
          <div className="p-2 bg-[#FAF9F5] rounded-xl border border-[#FAF0D9]">
            <Calendar className="w-5 h-5 text-[#BF9B30]" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#2F453A]">Hora Cerimónia</h4>
            <p className="text-sm text-[#556B2F]">12:30 • Igreja de Pedroso</p>
          </div>
        </div>

        <div className="flex items-start gap-3.5">
          <div className="p-2 bg-[#FAF9F5] rounded-xl border border-[#E6E8E3]">
            <MapPin className="w-5 h-5 text-[#4A5D4E]" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#2F453A]">Copo d'Água</h4>
            <p className="text-sm text-[#556B2F]">Quinta dos Jasmins</p>
          </div>
        </div>
      </div>

      {/* Micro instructions banner */}
      <div className="w-full max-w-md py-4 px-5 bg-[#FAF9F5] border border-[#ECD9A0]/40 rounded-2xl text-center">
        <p className="text-xs text-[#7A6B3D] leading-relaxed">
          📸 Tire fotos, grave áudios e marque os momentos diretamente neste portal ao longo do dia para construirmos o nosso álbum de memórias juntos!
        </p>
      </div>
    </div>
  );
}
