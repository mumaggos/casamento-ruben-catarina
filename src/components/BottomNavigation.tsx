/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Home, MapPin, Camera, MessageSquare } from "lucide-react";
import { ActiveTab } from "../types";

interface BottomNavigationProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
}

export default function BottomNavigation({ activeTab, onChangeTab }: BottomNavigationProps) {
  const items = [
    { id: "home", label: "Início", icon: Home },
    { id: "location", label: "Como Chegar", icon: MapPin },
    { id: "photos", label: "Álbum do Dia", icon: Camera },
    { id: "guestbook", label: "Mensagens", icon: MessageSquare }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-[#E6E8E3] z-50 py-2.5 px-4 pb-safe flex justify-around items-center max-w-md mx-auto shadow-lg rounded-t-3xl" id="footer-navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;

        return (
          <button
            key={item.id}
            onClick={() => onChangeTab(item.id as ActiveTab)}
            className="flex flex-col items-center justify-center flex-1 py-1 px-1.5 focus:outline-hidden"
          >
            <div 
              className={`p-1.5 rounded-2xl transition-all duration-300 ${
                isActive 
                  ? "bg-[#4A5D4E] text-white scale-105 shadow-sm" 
                  : "text-[#788A81] hover:text-[#4A5D4E] hover:bg-[#F4F6F2]"
              }`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <span 
              className={`text-[9px] mt-1 tracking-wide font-medium transition ${
                isActive ? "text-[#4A5D4E] font-semibold" : "text-[#788A81]"
              }`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
