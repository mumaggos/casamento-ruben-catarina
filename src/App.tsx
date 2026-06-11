/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Sparkles, Heart, Smartphone, Share2, Compass, Music, Clock, Sliders, Lock } from "lucide-react";
import { initializeUser } from "./firebase";
import { ActiveTab } from "./types";

// Modular Views
import LandingView from "./components/LandingView";
import LocationView from "./components/LocationView";
import PhotosView from "./components/PhotosView";
import GuestbookView from "./components/GuestbookView";
import BottomNavigation from "./components/BottomNavigation";
import QuizGuestView from "./components/QuizGuestView";
import AdminQuizView from "./components/AdminQuizView";
import MemoryView from "./components/MemoryView";
import WeddingPasscodeScreen from "./components/WeddingPasscodeScreen";

export default function App() {
  // Client-side instant redirection from the legacy domain to the new momentios.me domain
  if (typeof window !== "undefined" && window.location.hostname === "casamento-ruben-catarina.vercel.app") {
    window.location.replace("https://momentios.me" + window.location.pathname + window.location.search + window.location.hash);
    return null; // Stop rendering to avoid flicker/processing
  }

  const [isAuthorized, setIsAuthorized] = useState<boolean>(() => {
    return localStorage.getItem("wedding_access_authorized_v2") === "true";
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const pathname = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const search = window.location.search.toLowerCase();
    if (pathname.includes("/memoria") || hash.includes("#memoria") || pathname.includes("/memory") || hash.includes("#memory")) {
      return "memoria";
    }
    if (pathname.includes("/quiz") || hash.includes("#quiz") || search.includes("mesa=")) {
      return "quiz";
    }
    if (pathname.includes("/location") || hash.includes("#location")) return "location";
    if (pathname.includes("/photos") || hash.includes("#photos")) return "photos";
    if (pathname.includes("/guestbook") || hash.includes("#guestbook")) return "guestbook";
    return "home";
  });
  const [userId, setUserId] = useState<string | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [showPwaModal, setShowPwaModal] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState("");

  // Router routing states for Live Quiz System
  const [currentMesa, setCurrentMesa] = useState<number | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const mesaParam = params.get("mesa");
    if (mesaParam) {
      const parsed = parseInt(mesaParam, 10);
      return parsed >= 1 && parsed <= 12 ? parsed : null;
    }
    const hash = window.location.hash;
    const hashMatch = hash.match(/mesa=(\d+)/);
    if (hashMatch) {
      const parsed = parseInt(hashMatch[1], 10);
      return parsed >= 1 && parsed <= 12 ? parsed : null;
    }
    return null;
  });

  const [isAdminQuizRoute, setIsAdminQuizRoute] = useState<boolean>(() => {
    const pathname = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const search = window.location.search.toLowerCase();
    return pathname === "/admin-quiz" || hash === "#admin-quiz" || search.includes("page=admin-quiz");
  });

  const [isQuizRoute, setIsQuizRoute] = useState<boolean>(() => {
    const pathname = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const search = window.location.search.toLowerCase();
    return pathname.startsWith("/quiz") || hash.startsWith("#quiz") || search.includes("mesa=") || currentMesa !== null;
  });

  useEffect(() => {
    const syncRoutes = () => {
      const params = new URLSearchParams(window.location.search);
      const mesaParam = params.get("mesa");
      let mNumber: number | null = null;
      if (mesaParam) {
        const parsed = parseInt(mesaParam, 10);
        if (parsed >= 1 && parsed <= 12) mNumber = parsed;
      }

      const pathname = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      const search = window.location.search.toLowerCase();

      if (mNumber) {
        setCurrentMesa(mNumber);
      }
      setIsAdminQuizRoute(pathname === "/admin-quiz" || hash === "#admin-quiz" || search.includes("page=admin-quiz"));
      const isQuiz = pathname.startsWith("/quiz") || hash.startsWith("#quiz") || search.includes("mesa=") || mNumber !== null;
      setIsQuizRoute(isQuiz);

      if (isQuiz) {
        setActiveTab("quiz");
      } else if (pathname.includes("/memoria") || hash.includes("#memoria") || pathname.includes("/memory") || hash.includes("#memory")) {
        setActiveTab("memoria");
      } else if (pathname.includes("/location") || hash.includes("#location")) {
        setActiveTab("location");
      } else if (pathname.includes("/photos") || hash.includes("#photos")) {
        setActiveTab("photos");
      } else if (pathname.includes("/guestbook") || hash.includes("#guestbook")) {
        setActiveTab("guestbook");
      } else {
        setActiveTab("home");
      }
    };

    window.addEventListener("popstate", syncRoutes);
    window.addEventListener("hashchange", syncRoutes);
    return () => {
      window.removeEventListener("popstate", syncRoutes);
      window.removeEventListener("hashchange", syncRoutes);
    };
  }, []);

  const handleSetMesa = (mesaNum: number) => {
    setCurrentMesa(mesaNum);
    setIsQuizRoute(true);
    setActiveTab("quiz");
    const newUrl = `${window.location.pathname}?mesa=${mesaNum}`;
    window.history.pushState(null, "", newUrl);
  };

  const handleExitQuiz = () => {
    setIsQuizRoute(false);
    setIsAdminQuizRoute(false);
    setActiveTab("home");
    window.history.pushState(null, "", "/");
  };

  // Global guest states shared across all views
  const [guestName, setGuestName] = useState<string>(() => {
    return localStorage.getItem("wedding_guest_name") || "";
  });
  
  const [anonId, setAnonId] = useState<string>(() => {
    let id = localStorage.getItem("wedding_guest_anon_id");
    if (!id) {
      id = "guest_anon_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
      localStorage.setItem("wedding_guest_anon_id", id);
    }
    return id;
  });

  const handleUpdateGuestName = (newName: string) => {
    const trimmed = newName.trim();
    localStorage.setItem("wedding_guest_name", trimmed);
    setGuestName(trimmed);
  };

  const handleOpenNameModal = () => {
    setNameInput(guestName);
    setShowNameModal(true);
  };

  useEffect(() => {
    // Silently log guest in anonymously so we can track their actions, hearts, and notes
    initializeUser().then((user) => {
      if (user) {
        setUserId(user.uid);
      }
      setUserLoaded(true);
    });
  }, []);

  const handleShareApp = async () => {
    const shareData = {
      title: "Casamento de Rúben e Catarina",
      text: "Acompanhe e partilhe momentos no nosso dia especial!",
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert("Link do portal copiado! Partilhe-o com os outros convidados. 🔗");
      }
    } catch (err) {
      console.warn("Share aborted: ", err);
    }
  };

  const renderActiveView = () => {
    switch (activeTab) {
      case "home":
        return (
          <LandingView 
            onNavigate={(tab) => {
              const routePath = `/${tab}`;
              window.history.pushState(null, "", routePath);
              setActiveTab(tab);
            }} 
            guestName={guestName} 
            setGuestName={handleUpdateGuestName} 
            onShowNameModal={handleOpenNameModal}
          />
        );
      case "location":
        return <LocationView />;
      case "photos":
        return <PhotosView guestName={guestName} setGuestName={handleUpdateGuestName} anonId={anonId} userId={userId} onShowNameModal={handleOpenNameModal} />;
      case "guestbook":
        return <GuestbookView guestName={guestName} setGuestName={handleUpdateGuestName} anonId={anonId} userId={userId} onShowNameModal={handleOpenNameModal} />;
      case "quiz":
        return (
          <QuizGuestView 
            mesa={currentMesa} 
            onSetMesa={handleSetMesa} 
            onClearMesa={handleExitQuiz}
            anonId={anonId}
            guestName={guestName}
          />
        );
      case "memoria":
        return <MemoryView mode="guest" onNavigateHome={handleExitQuiz} />;
      default:
        return (
          <LandingView 
            onNavigate={(tab) => {
              const routePath = `/${tab}`;
              window.history.pushState(null, "", routePath);
              setActiveTab(tab);
            }} 
            guestName={guestName} 
            setGuestName={handleUpdateGuestName} 
            onShowNameModal={handleOpenNameModal}
          />
        );
    }
  };

  // Mandatory passcode "1406" entry check for anyone entering the wedding portal (excluding DJ Admin page)
  if (!isAuthorized && !isAdminQuizRoute) {
    return (
      <WeddingPasscodeScreen onCorrectPasscode={() => setIsAuthorized(true)} />
    );
  }

  if (isAdminQuizRoute) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] flex flex-col font-sans" id="app-root-container">
        {/* Container Constraint to mobile view feel */}
        <div className="w-full max-w-md mx-auto bg-white flex flex-col min-h-screen shadow-sm border-x border-[#E6E8E3] relative">
          
          {/* Admin Header */}
          <header className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-[#F0F2EE] py-3.5 px-4 flex items-center justify-between z-40 select-none">
            <div className="flex items-center gap-1.5 min-w-0">
              <Heart className="w-4 h-4 text-[#BF9B30] fill-[#BF9B30]/20 shrink-0" />
              <span className="font-serif text-base font-medium text-[#2F453A] truncate">
                Rúben & Catarina • DJ Admin
              </span>
            </div>
            
            <button
              onClick={handleExitQuiz}
              className="px-2.5 py-1.5 text-[10px] bg-[#FAF9F5] hover:bg-[#EBF0EC] text-[#4A5D4E] border border-[#E6E8E3] font-bold rounded-lg transition"
            >
              Voltar ao Portal
            </button>
          </header>

          <main className="flex-1 overflow-y-auto">
            {userLoaded ? (
              <AdminQuizView />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-[#788A81] gap-2">
                <Sparkles className="w-8 h-8 text-[#BF9B30] animate-spin" />
                <p className="text-xs font-semibold uppercase tracking-widest text-[#556B2F]">
                  A preparar painel...
                </p>
              </div>
            )}
          </main>
        </div>
      </div>
    );
  }



  return (
    <div className="min-h-screen bg-[#FAF9F5] flex flex-col" id="app-root-container">
      {/* Container Constraint to mobile view feel */}
      <div className="w-full max-w-md mx-auto bg-white flex flex-col min-h-screen shadow-sm border-x border-[#E6E8E3] pb-24 relative">
        
        {/* Top bar header */}
        <header className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-[#F0F2EE] py-3.5 px-4 flex items-center justify-between z-40 select-none">
          <div className="flex items-center gap-1.5 min-w-0">
            <Heart className="w-4 h-4 text-[#BF9B30] fill-[#BF9B30]/20 shrink-0" />
            <span className="font-serif text-base font-medium text-[#2F453A] truncate">
              Rúben & Catarina
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Guest Identity status indicator */}
            {guestName.trim() ? (
              <button
                onClick={handleOpenNameModal}
                className="px-2 py-1.5 bg-[#F4F6F2] hover:bg-[#EBF0EC] border border-[#E6E8E3] text-[10px] font-bold rounded-lg text-[#2F453A] transition flex items-center gap-1 max-w-[85px] truncate"
                title={`Identificado como: ${guestName}. Clique para alterar.`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                <span className="truncate">{guestName}</span>
              </button>
            ) : (
              <button
                onClick={handleOpenNameModal}
                className="px-2 py-1.5 bg-[#FAF9F5] border border-[#BF9B30]/30 hover:border-[#BF9B30] text-[#7A6B3D] text-[10px] font-bold rounded-lg transition"
                title="Identificar-se"
              >
                👤 Entrar
              </button>
            )}

            {/* Quick Share option */}
            <button
              onClick={handleShareApp}
              className="p-1.5 bg-[#F4F6F2] hover:bg-[#EBF0EC] active:bg-[#DFE5DF] text-[#4A5D4E] rounded-lg transition duration-150"
              title="Partilhar portal"
              id="btn-share-app"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>

            {/* PWA instructions button */}
            <button
              onClick={() => setShowPwaModal(true)}
              className="p-1.5 bg-[#FAF9F5] border border-[#BF9B30]/30 hover:border-[#BF9B30] text-[#7A6B3D] rounded-lg transition"
              title="Instalar no telefone"
              id="btn-pwa-guidance"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>

            {/* DJ Admin Lock Quick Shortcut */}
            <button
              onClick={() => {
                window.history.pushState(null, "", "/admin-quiz");
                window.dispatchEvent(new Event("popstate"));
              }}
              className="p-1.5 bg-amber-50 hover:bg-amber-100/70 text-[#BF9B30] border border-amber-200 rounded-lg transition"
              title="Painel do DJ / Administrador (Protegido)"
              id="btn-admin-shortcut"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Dynamic subview wrapper rendering */}
        <main className="flex-1 overflow-y-auto">
          {userLoaded ? (
            renderActiveView()
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-[#788A81] gap-2">
              <Sparkles className="w-8 h-8 text-[#BF9B30] animate-spin" />
              <p className="text-xs font-semibold uppercase tracking-widest text-[#556B2F]">
                A carregar portal...
              </p>
            </div>
          )}
        </main>

        {/* Elegant Bottom sheet navigation */}
        <BottomNavigation 
          activeTab={activeTab} 
          onChangeTab={(tab) => {
            if (tab === "quiz") {
              const mesaQuery = currentMesa ? `?mesa=${currentMesa}` : "";
              window.history.pushState(null, "", `/quiz${mesaQuery}`);
              setIsQuizRoute(true);
            } else {
              if (isQuizRoute) {
                window.history.pushState(null, "", "/");
                setIsQuizRoute(false);
              }
              const routePath = tab === "home" ? "/" : `/${tab}`;
              window.history.pushState ? window.history.pushState(null, "", routePath) : (window.location.hash = tab);
            }
            setActiveTab(tab);
          }} 
        />

        {/* Custom PWA Installation Instructions Modal */}
        {showPwaModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-[#E6E8E3] shadow-lg flex flex-col gap-4 text-left">
              <div className="flex items-center justify-between border-b border-[#F0F2EE] pb-3">
                <h3 className="font-serif text-lg text-[#2F453A] font-semibold flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-[#BF9B30]" />
                  Instalar no Telemóvel
                </h3>
                <button
                  onClick={() => setShowPwaModal(false)}
                  className="text-[#788A81] hover:text-neutral-950 font-bold text-lg p-1"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-[#788A81] leading-relaxed">
                Adicione este portal diretamente ao ecrã principal do seu telefone para uma experiência com 1 clique durante todo o dia sem precisar de abrir o navegador.
              </p>

              <div className="space-y-4 pt-1">
                {/* Safari instructions */}
                <div className="bg-[#FAF9F5] border border-[#BF9B30]/10 rounded-xl p-3">
                  <p className="text-xs font-semibold text-[#7A6B3D] flex items-center gap-1.5 mb-1.5">
                    🍏 iPhone o Safari
                  </p>
                  <ol className="text-[11px] text-[#4E5C54] list-decimal pl-4.5 space-y-1">
                    <li>Pressione o botão de <b>Partilhar</b> <Share2 className="w-3 h-3 inline text-blue-500" /> no fundo do Safari.</li>
                    <li>Deslize para baixo e toque em <b>“Ecrã Principal”</b>.</li>
                    <li>Toque em “Adicionar” no canto superior direito.</li>
                  </ol>
                </div>

                {/* Chrome instructions */}
                <div className="bg-[#F4F6F2] border border-[#E6E8E3] rounded-xl p-3">
                  <p className="text-xs font-semibold text-[#556B2F] flex items-center gap-1.5 mb-1.5">
                    🤖 Android o Chrome
                  </p>
                  <ol className="text-[11px] text-[#4E5C54] list-decimal pl-4.5 space-y-1">
                    <li>Toque no ícone de <b>3 pontos</b> ⋮ no canto superior direito do Chrome.</li>
                    <li>Carregue em <b>“Adicionar ao Ecrã Principal”</b> ou “Instalar App”.</li>
                    <li>Siga os passos de validação do sistema.</li>
                  </ol>
                </div>
              </div>

              <button
                onClick={() => setShowPwaModal(false)}
                className="w-full py-2.5 bg-[#4A5D4E] hover:bg-[#3E4F41] text-white rounded-xl font-semibold text-xs transition mt-2 text-center"
              >
                Compreendido!
              </button>
            </div>
          </div>
        )}

        {/* Global Wedding Guest Name custom modal */}
        {showNameModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-[#E6E8E3] shadow-lg flex flex-col gap-4 text-left">
              <div className="flex items-center justify-between border-b border-[#F0F2EE] pb-3">
                <h3 className="font-serif text-base text-[#2F453A] font-light flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#BF9B30]" />
                  <span>Como o devemos chamar?</span>
                </h3>
                {guestName.trim() && (
                  <button
                    onClick={() => setShowNameModal(false)}
                    className="text-[#788A81] hover:text-neutral-950 font-semibold p-1"
                  >
                    ✕
                  </button>
                )}
              </div>

              <p className="text-xs text-[#788A81] leading-relaxed">
                Introduza o seu nome para podermos saber quem adiciona fotos ao álbum, faz sugestões de música ou deixa votos no Livro de Honra!
              </p>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[#7A6B3D] font-bold mb-1.5">O Seu Nome</label>
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck="false"
                  placeholder="Ex: Tio João, Prima Clara, Pedro..."
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full px-4 py-3 bg-[#FAF9F5] border border-[#C5CBC6] rounded-xl text-xs text-[#2F453A] focus:outline-hidden focus:ring-1 focus:ring-[#4A5D4E] focus:border-[#4A5D4E]"
                />
              </div>

              <div className="flex gap-2 pt-1">
                {guestName.trim() && (
                  <button
                    onClick={() => setShowNameModal(false)}
                    className="flex-1 py-2.5 px-3 bg-white text-[#2F453A] border border-[#C5CBC6] text-xs font-semibold rounded-lg hover:bg-neutral-50 transition"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  onClick={() => {
                    if (nameInput.trim()) {
                      handleUpdateGuestName(nameInput.trim());
                      setShowNameModal(false);
                    } else {
                      alert("Por favor, introduza o seu nome para continuar!");
                    }
                  }}
                  className="flex-1 py-2.5 px-4 bg-[#4A5D4E] text-white text-xs font-semibold rounded-lg hover:bg-[#3E4F41] transition text-center"
                >
                  Guardar e Continuar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
