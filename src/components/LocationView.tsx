/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { MapPin, Navigation, Copy, Check, Info, Clock, Car } from "lucide-react";
import jasminsImage from "../assets/images/quinta_jasmins_watercolor_1780327490515.png";

export default function LocationView() {
  const [copied, setCopied] = useState(false);
  const locationUrl = "https://www.google.com/maps/search/?api=1&query=Quinta+dos+Jasmins+Rua+do+Barrimau+55+Ferreira+Pacos+de+Ferreira";
  const addressText = "Rua do Barrimau, 55, 4590-750 Ferreira, Paços de Ferreira";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(addressText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  };

  const handleOpenNavigation = () => {
    window.open(locationUrl, "_blank");
  };

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto px-4 py-6 text-center">
      {/* Visual Decoration */}
      <div className="w-16 h-16 rounded-full bg-[#FAF9F5] border border-[#BF9B30]/30 flex items-center justify-center mb-4">
        <MapPin className="w-7 h-7 text-[#BF9B30]" />
      </div>

      <h2 className="font-serif text-2xl text-[#2F453A] font-light mb-2">
        Quinta dos Jasmins
      </h2>
      <p className="text-xs text-[#788A81] uppercase tracking-wider mb-6">
        Local do Copo d'Água • Festa
      </p>

      {/* Map Card */}
      <div className="w-full bg-white rounded-3xl border border-[#E6E8E3] overflow-hidden shadow-md mb-6 text-left">
        {/* Watercolor Representation of the Quinta */}
        <div className="h-56 relative overflow-hidden">
          <picture>
            <img 
              src={jasminsImage}
              alt="Quinta dos Jasmins Garden" 
              className="w-full h-full object-cover select-none pointer-events-none"
              referrerPolicy="no-referrer"
            />
          </picture>
          
          {/* Subtle elegant gradient overlay for readability (highly transparent at bottom so image is fully visible) */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent"></div>
          
          {/* Floating Address and Details over image - transparent with elegant lettering and no background boxes */}
          <div className="absolute bottom-4 left-5 right-5 z-10 text-white select-none">
            <p className="text-sm font-semibold text-white/95 leading-relaxed drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]">
              Rua do Barrimau, 55<br />
              4590-750 Ferreira<br />
              Paços de Ferreira
            </p>
            <p className="text-[10px] text-[#E6C6AC] font-medium mt-1 tracking-wider uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">Ferreira, Paços de Ferreira</p>
          </div>
        </div>

        <div className="p-4 space-y-3.5">
          {/* Faux Route Timing Indicator */}
          <div className="flex items-center gap-3 text-xs text-[#556B2F] bg-[#F4F6F2] p-3 rounded-xl border border-[#E6E8E3]">
            <Clock className="w-4 h-4 text-[#4A5D4E]" />
            <div>
              <p className="font-medium text-[#2F453A]">Tempo Estimado (da Igreja)</p>
              <p className="text-[11px] text-[#788A81]">tempo estimado 30 min 49 km pela autoestrada</p>
            </div>
          </div>

          {/* Transportation Tip */}
          <div className="flex items-center gap-3 text-xs text-[#556B2F] bg-[#FAF9F5] p-3 rounded-xl border border-[#BF9B30]/20">
            <Car className="w-4 h-4 text-[#BF9B30]" />
            <div>
              <p className="font-medium text-[#7A6B3D]">Dica de Estacionamento</p>
              <p className="text-[11px] text-[#7A6B3D]/80">Estacionamento privativo gratuito no local.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Buttons */}
      <div className="w-full space-y-3 mb-6">
        <button
          onClick={handleOpenNavigation}
          className="w-full py-4 px-6 bg-[#4A5D4E] hover:bg-[#3E4F41] active:bg-[#2C382E] text-white rounded-xl font-medium text-sm shadow-sm transition-all flex items-center justify-center gap-2"
          id="btn-open-navigation"
        >
          <Navigation className="w-4 h-4 fill-white" />
          <span>Abrir no Google Maps</span>
        </button>

        <button
          onClick={handleCopy}
          className="w-full py-3 px-6 bg-white hover:bg-[#FBFBFB] active:bg-[#F5F5F5] text-[#2F453A] border border-[#C5CBC6] rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2"
          id="btn-copy-address"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-green-600 animate-scale" />
              <span className="text-green-600">Copiado para o clipboard!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copiar Morada</span>
            </>
          )}
        </button>
      </div>

      {/* Igreja Info Block */}
      <div className="w-full bg-[#FAF9F5] rounded-xl p-4 border border-[#BF9B30]/10 text-left mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-[#BF9B30]" />
          <h3 className="text-xs font-semibold text-[#7A6B3D] uppercase tracking-wider">
            Cerimónia Religiosa
          </h3>
        </div>
        <p className="text-sm font-semibold text-[#2F453A]">Igreja de Pedroso</p>
        <p className="text-xs text-[#788A81] mt-0.5">Mosteiro de Pedroso, 4415 Pedroso</p>
        <div className="mt-3 text-xs text-[#556B2F] flex items-center gap-1.5 bg-white py-1.5 px-2.5 rounded-lg border border-[#E6E8E3] w-fit">
          <Clock className="w-3.5 h-3.5 text-[#BF9B30]" />
          <span>Hora: 12:30</span>
        </div>
      </div>
    </div>
  );
}
