#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para probar el flujo del chatbot STI con 4 conversaciones simuladas
"""

import requests
import json
import time
from typing import Dict, Any, Optional

BASE_URL = "http://localhost:3001"
HEADERS = {
    'Origin': 'http://localhost:3001',
    'Content-Type': 'application/json'
}

class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

class ChatSimulator:
    def __init__(self):
        self.session_id = None
        self.current_stage = None
        self.log = []
        
    def start_conversation(self):
        """Inicia una nueva conversación con el bot"""
        try:
            response = requests.get(f"{BASE_URL}/api/greeting", headers=HEADERS)
            data = response.json()
            
            self.session_id = data.get('sessionId')
            self.current_stage = data.get('stage')
            
            print(f"{Colors.OKGREEN}✅ Conversación iniciada{Colors.ENDC}")
            print(f"{Colors.OKBLUE}SessionId:{Colors.ENDC} {self.session_id[:8]}...")
            print(f"{Colors.OKBLUE}Stage:{Colors.ENDC} {self.current_stage}")
            print(f"\n{Colors.OKCYAN}Bot dice:{Colors.ENDC} {data.get('reply')}\n")
            
            self.log.append({
                'timestamp': time.time(),
                'user_input': '[INICIO]',
                'stage_before': None,
                'stage_after': self.current_stage,
                'bot_reply': data.get('reply')[:100] + '...'
            })
            
            return data
        except Exception as e:
            print(f"{Colors.FAIL}❌ Error al iniciar conversación: {e}{Colors.ENDC}")
            return None
    
    def send_message(self, text: Optional[str] = None, button_id: Optional[str] = None):
        """Envía un mensaje de texto o presiona un botón"""
        if not self.session_id:
            print(f"{Colors.FAIL}❌ No hay sesión activa{Colors.ENDC}")
            return None
        
        stage_before = self.current_stage
        
        payload = {'sessionId': self.session_id}
        
        if button_id:
            payload['buttonId'] = button_id
            user_input = f"[BUTTON: {button_id}]"
        else:
            payload['text'] = text
            user_input = text
        
        try:
            response = requests.post(f"{BASE_URL}/api/chat", headers=HEADERS, json=payload)
            data = response.json()
            
            self.current_stage = data.get('stage', self.current_stage)
            
            print(f"{Colors.OKBLUE}Usuario:{Colors.ENDC} {user_input}")
            print(f"{Colors.OKBLUE}Stage:{Colors.ENDC} {stage_before} → {self.current_stage}")
            print(f"{Colors.OKCYAN}Bot dice:{Colors.ENDC} {data.get('reply')}\n")
            
            self.log.append({
                'timestamp': time.time(),
                'user_input': user_input,
                'stage_before': stage_before,
                'stage_after': self.current_stage,
                'bot_reply': data.get('reply')[:100] + '...'
            })
            
            return data
        except Exception as e:
            print(f"{Colors.FAIL}❌ Error al enviar mensaje: {e}{Colors.ENDC}")
            return None
    
    def print_summary(self):
        """Imprime resumen de la conversación"""
        print(f"\n{Colors.BOLD}📊 RESUMEN DE LA CONVERSACIÓN{Colors.ENDC}")
        print(f"SessionId: {self.session_id[:8]}...")
        print(f"Interacciones: {len(self.log)}")
        print(f"Etapa final: {self.current_stage}")
        
        # Mostrar flujo de etapas
        stages = [log['stage_after'] for log in self.log if log['stage_after']]
        print(f"Flujo de etapas: {' → '.join(set(stages))}")

def run_simulation_1():
    """Simulación 1: Usuario Anónimo - 'Mi compu no enciende'"""
    print(f"\n{Colors.HEADER}{'='*80}")
    print(f"🎬 SIMULACIÓN 1: Usuario Anónimo - 'Mi compu no enciende'")
    print(f"{'='*80}{Colors.ENDC}\n")
    
    sim = ChatSimulator()
    sim.start_conversation()
    time.sleep(0.5)
    
    sim.send_message(button_id="BTN_LANG_ES_AR")
    time.sleep(0.5)
    
    sim.send_message(button_id="BTN_NO_NAME")
    time.sleep(0.5)
    
    sim.send_message(button_id="BTN_HELP")
    time.sleep(0.5)
    
    sim.send_message(text="mi compu no enciende")
    time.sleep(0.5)
    
    sim.send_message(text="es una notebook HP Pavilion")
    time.sleep(0.5)
    
    sim.send_message(button_id="BTN_TESTS_DONE")
    time.sleep(0.5)
    
    sim.print_summary()
    print(f"{Colors.OKGREEN}✅ Simulación 1 completada{Colors.ENDC}\n")

def run_simulation_2():
    """Simulación 2: Roberto - 'Instalar app en Stick TV'"""
    print(f"\n{Colors.HEADER}{'='*80}")
    print(f"🎬 SIMULACIÓN 2: Roberto - 'Instalar app en Stick TV'")
    print(f"{'='*80}{Colors.ENDC}\n")
    
    sim = ChatSimulator()
    sim.start_conversation()
    time.sleep(0.5)
    
    sim.send_message(button_id="BTN_LANG_ES_ES")
    time.sleep(0.5)
    
    sim.send_message(text="Roberto")
    time.sleep(0.5)
    
    sim.send_message(button_id="BTN_TASK")
    time.sleep(0.5)
    
    sim.send_message(text="necesito ayuda para instalar una app en mi stick tv")
    time.sleep(0.5)
    
    sim.send_message(button_id="BTN_SOLVED")
    time.sleep(0.5)
    
    sim.print_summary()
    print(f"{Colors.OKGREEN}✅ Simulación 2 completada{Colors.ENDC}\n")

def run_simulation_3():
    """Simulación 3: Heber - 'Configurar WAN en MikroTik'"""
    print(f"\n{Colors.HEADER}{'='*80}")
    print(f"🎬 SIMULACIÓN 3: Heber - 'Configurar WAN en MikroTik'")
    print(f"{'='*80}{Colors.ENDC}\n")
    
    sim = ChatSimulator()
    sim.start_conversation()
    time.sleep(0.5)
    
    sim.send_message(button_id="BTN_LANG_EN")
    time.sleep(0.5)
    
    sim.send_message(text="Heber")
    time.sleep(0.5)
    
    sim.send_message(button_id="BTN_HELP")
    time.sleep(0.5)
    
    sim.send_message(text="asistencia para configurar una conexión wan en un microtik")
    time.sleep(0.5)
    
    sim.send_message(text="MikroTik RB750Gr3")
    time.sleep(0.5)
    
    sim.send_message(button_id="BTN_TESTS_FAIL")
    time.sleep(0.5)
    
    sim.send_message(button_id="BTN_YES")
    time.sleep(0.5)
    
    sim.print_summary()
    print(f"{Colors.OKGREEN}✅ Simulación 3 completada{Colors.ENDC}\n")

def run_simulation_4():
    """Simulación 4: Valeria - 'Notebook no enciende' → Ticket WhatsApp"""
    print(f"\n{Colors.HEADER}{'='*80}")
    print(f"🎬 SIMULACIÓN 4: Valeria - 'Notebook no enciende' → Ticket WhatsApp")
    print(f"{'='*80}{Colors.ENDC}\n")
    
    sim = ChatSimulator()
    sim.start_conversation()
    time.sleep(0.5)
    
    sim.send_message(button_id="BTN_LANG_ES_AR")
    time.sleep(0.5)
    
    sim.send_message(text="Valeria")
    time.sleep(0.5)
    
    sim.send_message(button_id="BTN_HELP")
    time.sleep(0.5)
    
    sim.send_message(text="tu notebook no enciende")
    time.sleep(0.5)
    
    sim.send_message(text="Dell Inspiron 15")
    time.sleep(0.5)
    
    sim.send_message(button_id="BTN_TESTS_FAIL")
    time.sleep(0.5)
    
    sim.send_message(button_id="BTN_YES")
    time.sleep(0.5)
    
    sim.send_message(text="valeria@email.com")
    time.sleep(0.5)
    
    sim.send_message(text="+54 9 11 1234-5678")
    time.sleep(0.5)
    
    sim.print_summary()
    print(f"{Colors.OKGREEN}✅ Simulación 4 completada (TICKET GENERADO){Colors.ENDC}\n")

if __name__ == "__main__":
    print(f"{Colors.BOLD}{Colors.HEADER}")
    print("╔══════════════════════════════════════════════════════════════════════════════╗")
    print("║              🧪 TEST DE FLUJO DE CONVERSACIÓN - STI CHATBOT                  ║")
    print("╚══════════════════════════════════════════════════════════════════════════════╝")
    print(f"{Colors.ENDC}\n")
    
    try:
        run_simulation_1()
        run_simulation_2()
        run_simulation_3()
        run_simulation_4()
        
        print(f"\n{Colors.OKGREEN}{Colors.BOLD}✅ TODAS LAS SIMULACIONES COMPLETADAS{Colors.ENDC}")
        print(f"\n{Colors.OKCYAN}📊 Revisa los logs en: data/logs/flow-audit.csv{Colors.ENDC}")
        print(f"{Colors.OKCYAN}📊 Dashboard disponible en: http://localhost:3001/flow-audit.html{Colors.ENDC}\n")
        
    except KeyboardInterrupt:
        print(f"\n{Colors.WARNING}⚠️  Pruebas interrumpidas por el usuario{Colors.ENDC}")
    except Exception as e:
        print(f"\n{Colors.FAIL}❌ Error durante las pruebas: {e}{Colors.ENDC}")
