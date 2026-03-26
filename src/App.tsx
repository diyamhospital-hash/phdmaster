import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, 
  BookOpen, 
  Cpu, 
  ChevronRight, 
  Loader2, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  History, 
  Layers, 
  Zap, 
  ShieldCheck,
  MessageSquare,
  Mic,
  MicOff,
  BrainCircuit,
  Send,
  User,
  Bot,
  Copy,
  Check,
  X,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, GenerateContentResponse, ThinkingLevel, Modality } from "@google/genai";
import OpenAI from 'openai';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Topic {
  title: string;
  description: string;
  difficulty: string;
  type: string;
  tags: string[];
}

interface ThesisSection {
  title: string;
  content: string;
  assignedTo?: string;
  status: 'pending' | 'writing' | 'completed';
}

interface TeamMember {
  name: string;
  password: string;
  assignedSectionIds: string[];
  progress: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// --- Constants ---
const SECTIONS_CONFIG = [
  { id: 'abstract', n: 'Research Abstract', p: 'Draft a professional scholarly abstract (300-500 words) that captures the essence of the investigation, methodology, and core contributions. Ensure the tone is academic yet authentic.' },
  { id: 'intro', n: 'Phase 1: Introduction & Context', p: 'Develop the foundational narrative including background, problem articulation, and research objectives. Focus on the human-centric impact of the technology.' },
  { id: 'lit_review', n: 'Phase 2: Scholarly Review', p: 'Critically examine existing works in this domain. Synthesize current knowledge and identify the specific niche this research fulfills.' },
  { id: 'methodology', n: 'Phase 3: Investigation Framework', p: 'Outline the research design, theoretical models, or experimental protocols. Describe the process with clarity and technical depth.' },
  { id: 'results', n: 'Phase 4: Analysis & Synthesis', p: 'Present the findings and technical insights. Discuss the implications and comparative advantages in a scholarly manner.' },
  { id: 'conclusion', n: 'Phase 5: Synthesis & Future Horizons', p: 'Reflect on the contributions, acknowledge limitations, and project future research directions.' }
];

const BRANCHES = [
  "Computer Science & Engineering",
  "Electronics & Communication",
  "Mechanical Engineering",
  "Civil Engineering",
  "Electrical Engineering",
  "Biotechnology"
];

const KEYWORDS = {
  "Computer Science & Engineering": ["Machine Learning", "Blockchain", "Cloud Computing", "Cybersecurity", "IoT", "NLP"],
  "Electronics & Communication": ["VLSI Design", "Embedded Systems", "5G Networks", "Signal Processing", "Robotics", "Antenna Design"],
  "Mechanical Engineering": ["Thermodynamics", "Fluid Mechanics", "CAD/CAM", "Mechatronics", "Renewable Energy", "Automotive"],
  "Civil Engineering": ["Structural Analysis", "Geotechnical", "Transportation", "Environmental", "Hydraulics", "Construction"],
  "Electrical Engineering": ["Power Systems", "Control Systems", "Smart Grids", "Electric Vehicles", "High Voltage", "Machines"],
  "Biotechnology": ["Genetic Engineering", "Bioinformatics", "Molecular Biology", "Bioprocess", "Immunology", "CRISPR"]
};

// --- Main Component ---
export default function App() {
  // State
  const [step, setStep] = useState(1);
  const [branch, setBranch] = useState("");
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);
  const [selectedTopicIndices, setSelectedTopicIndices] = useState<number[]>([]);
  const [thesisSections, setThesisSections] = useState<ThesisSection[]>([]);
  const [currentGeneratingIndex, setCurrentGeneratingIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Auth & Team State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'member' | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberPassword, setNewMemberPassword] = useState("");
  const [hfToken, setHfToken] = useState("");
  const [animationState, setAnimationState] = useState<'walking' | 'dancing' | 'writing' | 'idle'>('idle');

  // Gemini Features State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isHighThinking, setIsHighThinking] = useState(false);
  const [isLiveVoiceOpen, setIsLiveVoiceOpen] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");

  // Refs
  const mainBodyRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const liveSessionRef = useRef<any>(null);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // HF Token Persistence
  useEffect(() => {
    const savedToken = localStorage.getItem('hf_token');
    if (savedToken) setHfToken(savedToken);
  }, []);

  useEffect(() => {
    if (hfToken) localStorage.setItem('hf_token', hfToken);
  }, [hfToken]);

  // --- AI Model Clients ---
  const getGeminiAI = () => {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing");
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  };

  const callNvidiaProxy = async (params: { prompt: string; systemInstruction?: string; model?: string; response_format?: any }) => {
    const response = await fetch('/api/generate-thesis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to call NVIDIA proxy");
    }
    
    const data = await response.json();
    return data.text;
  };

  const callHFProxy = async (params: { prompt: string; systemInstruction?: string }) => {
    if (!hfToken) throw new Error("Hugging Face Token is required for human-like generation.");
    
    const client = new OpenAI({
      baseURL: "https://router.huggingface.co/v1",
      apiKey: hfToken,
      dangerouslyAllowBrowser: true
    });

    const chatCompletion = await client.chat.completions.create({
      model: "Qwen/Qwen3.5-35B-A3B:fastest",
      messages: [
        { role: "system", content: params.systemInstruction || "You are an expert academic writer." },
        { role: "user", content: params.prompt },
      ],
    });

    return chatCompletion.choices[0].message.content;
  };

  // --- Logic ---
  const toggleKeyword = (kw: string) => {
    setSelectedKeywords(prev => 
      prev.includes(kw) ? prev.filter(k => k !== kw) : [...prev, kw]
    );
  };

  const generateTopics = async () => {
    if (!branch || selectedKeywords.length === 0) return;
    setIsGeneratingTopics(true);
    setError(null);
    setStep(2);

    try {
      const prompt = `Generate 4 unique, high-level MTech/PhD research topics for the branch of ${branch} focusing on keywords: ${selectedKeywords.join(', ')}. 
      For each topic, provide:
      1. A scholarly title.
      2. A brief 2-sentence description.
      3. Difficulty level (Advanced/Expert).
      4. Research type (Experimental/Analytical/Simulation).
      5. 3 technical tags.
      
      Format as JSON array of objects with keys: title, description, difficulty, type, tags.`;

      const content = await callNvidiaProxy({
        model: "meta/llama-3.1-405b-instruct",
        prompt: prompt,
        response_format: { type: "json_object" }
      });

      if (!content) throw new Error("No content received from NVIDIA NIM");
      
      const parsed = JSON.parse(content);
      const topicsArray = Array.isArray(parsed) ? parsed : (parsed.topics || Object.values(parsed)[0]);
      setTopics(topicsArray);
    } catch (err: any) {
      console.error("NVIDIA API Error:", err);
      setError("Failed to generate topics. Please check your connection or API key.");
      setStep(1);
    } finally {
      setIsGeneratingTopics(false);
    }
  };

  const toggleTopicSelection = (index: number) => {
    setSelectedTopicIndices(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const startThesisGeneration = async () => {
    if (selectedTopicIndices.length === 0) return;
    setStep(3);
    setThesisSections([]);
    setError(null);
    setAnimationState('walking');

    const topic = topics[selectedTopicIndices[0]];
    const gemini = getGeminiAI();

    // Auto-assign if not already done
    if (teamMembers.length > 0 && teamMembers.every(m => m.assignedSectionIds.length === 0)) {
      assignSectionsToTeam();
    }

    // Move to dancing state when team meets (simulated delay)
    setTimeout(() => {
      if (step === 3) setAnimationState('dancing');
    }, 3000);

    for (let i = 0; i < SECTIONS_CONFIG.length; i++) {
      setCurrentGeneratingIndex(i);
      setAnimationState('writing');
      const section = SECTIONS_CONFIG[i];
      
      // Update member progress if assigned
      if (teamMembers.length > 0) {
        setTeamMembers(prev => prev.map(m => {
          if (m.assignedSectionIds.includes(section.id)) {
            const totalAssigned = m.assignedSectionIds.length;
            const completedInAssigned = m.assignedSectionIds.filter(id => 
              SECTIONS_CONFIG.findIndex(s => s.id === id) < i
            ).length;
            return { ...m, progress: Math.round(((completedInAssigned + 1) / totalAssigned) * 100) };
          }
          return m;
        }));
      }

      try {
        let content = "";
        
        // Auto-model selection logic: Human-like skill generator
        // We use HF Qwen for sections requiring high human-like nuance
        const useHF = i === 1 || i === 4; // Introduction and Analysis benefit from Qwen's nuance
        const useThinking = !useHF && (isHighThinking || i === 0 || i === 5); // Abstract and Conclusion use Gemini Pro
        
        const humanizerInstruction = "You are a world-class academic researcher. Write with human-like skill, deep nuance, and organic flow. Avoid all robotic AI patterns, repetitive sentence starters, and overly structured lists. Use complex, varied vocabulary and scholarly metaphors. Your goal is to produce research that is indistinguishable from high-level manual scholarly writing and bypasses all AI detection systems. Slogan: Help by a C********A always be ready.";

        if (useHF && hfToken) {
          content = await callHFProxy({
            systemInstruction: humanizerInstruction,
            prompt: `Develop the ${section.n} for the research: "${topic.title}". Context: ${topic.description}. Instructions: ${section.p}.`
          }) || "";
        } else if (useThinking) {
          const response = await gemini.models.generateContent({
            model: "gemini-3.1-pro-preview",
            contents: `As a Senior Research Lead, develop the ${section.n} for the investigation titled "${topic.title}". 
            Focus: ${topic.description}. 
            Guidelines: ${section.p}. 
            Humanization Protocol: ${humanizerInstruction}`,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
            }
          });
          content = response.text || "";
        } else {
          content = await callNvidiaProxy({
            model: i % 2 === 0 ? "meta/llama-3.1-405b-instruct" : "nvidia/llama-3.1-nemotron-70b-instruct",
            systemInstruction: humanizerInstruction,
            prompt: `Draft ${section.n} for the research: "${topic.title}". Context: ${topic.description}. Instructions: ${section.p}.`
          });
        }

        setThesisSections(prev => [...prev, { title: section.n, content, status: 'completed' }]);
      } catch (err) {
        console.error(`Error generating ${section.n}:`, err);
        setError(`Error generating ${section.n}. Continuing...`);
      }
    }
    
    setCurrentGeneratingIndex(-1);
    setStep(4);
    setAnimationState('idle');
  };

  const downloadDocx = async () => {
    // In a real app, we'd use a library like 'docx'
    // For this demo, we'll create a simple text blob that mimics a doc structure
    const fullText = thesisSections.map(s => `${s.title}\n\n${s.content}\n\n`).join('---\n\n');
    const blob = new Blob([fullText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Thesis_${branch.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // --- Gemini Chat Logic ---
  const sendChatMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    
    const userMsg: ChatMessage = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const ai = getGeminiAI();
      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: "You are Priyanka Master, a PhD Research Advisor at PriyankaTech Studio by Trishika Technologies and Solutions. You are professional, technical, and highly skilled in MTech/PhD thesis analysis. Your slogan is 'Help by a C********A always be ready'. Always be ready to help with research methodology, literature review, and technical writing. Use a human-like, encouraging tone."
        }
      });

      const response = await chat.sendMessage({ message: chatInput });
      const assistantMsg: ChatMessage = { role: 'assistant', content: response.text || "I'm sorry, I couldn't process that." };
      setChatMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error("Chat Error:", err);
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Error: Failed to connect to Gemini. Please check your API key." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // --- Gemini Live Voice Logic ---
  const startLiveVoice = async () => {
    if (isLiveActive) return;
    setIsLiveActive(true);
    setLiveTranscript("Connecting to Live Research Advisor...");

    try {
      const ai = getGeminiAI();
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      
      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } }
          },
          systemInstruction: "You are a real-time research advisor at PriyankaTech Studio by Trishika Technologies and Solutions. Discuss thesis ideas concisely and professionally. Slogan: Help by a C********A always be ready."
        },
        callbacks: {
          onopen: async () => {
            setLiveTranscript("Live Session Active. Speak now...");
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const processor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmData = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
              }
              const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
              session.sendRealtimeInput({ audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' } });
            };

            source.connect(processor);
            processor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (msg) => {
            if (msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              const base64Audio = msg.serverContent.modelTurn.parts[0].inlineData.data;
              const binary = atob(base64Audio);
              const bytes = new Int16Array(binary.length / 2);
              for (let i = 0; i < bytes.length; i++) {
                bytes[i] = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
              }
              const floatData = new Float32Array(bytes.length);
              for (let i = 0; i < bytes.length; i++) {
                floatData[i] = bytes[i] / 0x7FFF;
              }
              const buffer = audioContextRef.current!.createBuffer(1, floatData.length, 16000);
              buffer.getChannelData(0).set(floatData);
              const source = audioContextRef.current!.createBufferSource();
              source.buffer = buffer;
              source.connect(audioContextRef.current!.destination);
              source.start();
            }
          },
          onclose: () => stopLiveVoice(),
          onerror: (err) => {
            console.error("Live Error:", err);
            stopLiveVoice();
          }
        }
      });

      liveSessionRef.current = session;
    } catch (err) {
      console.error("Live Start Error:", err);
      stopLiveVoice();
    }
  };

  const stopLiveVoice = () => {
    liveSessionRef.current?.close();
    liveSessionRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    setIsLiveActive(false);
    setLiveTranscript("");
  };

  const handleLogin = () => {
    if (loginName.toLowerCase() === "admin" && loginPassword === "Pinky99@") {
      setIsLoggedIn(true);
      setUserRole('admin');
      setLoginError(false);
    } else {
      const member = teamMembers.find(m => m.name.toLowerCase() === loginName.toLowerCase() && m.password === loginPassword);
      if (member) {
        setIsLoggedIn(true);
        setUserRole('member');
        setLoginError(false);
      } else {
        setLoginError(true);
      }
    }
  };

  const addTeamMember = () => {
    if (!newMemberName || !newMemberPassword) return;
    const newMember: TeamMember = {
      name: newMemberName,
      password: newMemberPassword,
      assignedSectionIds: [],
      progress: 0
    };
    setTeamMembers([...teamMembers, newMember]);
    setNewMemberName("");
    setNewMemberPassword("");
  };

  const assignSectionsToTeam = () => {
    if (teamMembers.length === 0) return;
    const updatedMembers = teamMembers.map(m => ({ ...m, assignedSectionIds: [] }));
    const sectionIds = SECTIONS_CONFIG.map(s => s.id);
    
    sectionIds.forEach((id, index) => {
      const memberIndex = index % updatedMembers.length;
      updatedMembers[memberIndex].assignedSectionIds.push(id);
    });
    
    setTeamMembers(updatedMembers);
  };

  // --- UI Components ---
  const TeamAnimation = () => {
    return (
      <div className="relative h-[600px] w-full bg-black/40 rounded-[60px] border border-white/10 overflow-hidden group shadow-2xl mb-16" style={{ perspective: '1200px' }}>
        {/* 3D Floor Grid with Perspective */}
        <div 
          className="absolute inset-0 opacity-20"
          style={{ 
            backgroundImage: `linear-gradient(to right, #4285f4 1px, transparent 1px), linear-gradient(to bottom, #4285f4 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            transform: 'rotateX(60deg) translateY(-100px) translateZ(-200px)',
            transformOrigin: 'top'
          }}
        />
        
        {/* Atmospheric Glows */}
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-brand/10 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px]" />

        {/* Floating Radar / Sector UI (In front of girl) */}
        <motion.div 
          animate={{ 
            rotateY: [0, 15, 0, -15, 0],
            y: [0, -10, 0]
          }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none"
          style={{ transformStyle: 'preserve-3d' }}
        >
          <div className="w-96 h-96 rounded-full border border-brand/40 relative flex items-center justify-center bg-brand/5 backdrop-blur-sm shadow-[0_0_50px_rgba(66,133,244,0.2)]">
            {/* Radar Sweeper */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-brand/20 to-transparent rounded-full"
            />
            {/* IT Sectors / Data Nodes */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
              <motion.div 
                key={i}
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 2, delay: i * 0.2, repeat: Infinity }}
                className="absolute w-2 h-2 bg-brand rounded-full shadow-[0_0_10px_#4285f4]"
                style={{ 
                  transform: `rotate(${deg}deg) translateY(-160px)`
                }}
              />
            ))}
            {/* Central Core */}
            <div className="w-16 h-16 rounded-full bg-brand/20 border border-brand/40 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-brand animate-ping opacity-50" />
              <BrainCircuit className="text-brand absolute" size={24} />
            </div>
          </div>
        </motion.div>

        {/* Main User (3D Character Placeholder) */}
        <motion.div 
          animate={{ 
            x: animationState === 'walking' ? [0, 50, 0, -50, 0] : 0,
            y: animationState === 'dancing' ? [0, -20, 0] : 0,
            scale: [1, 1.02, 1]
          }}
          transition={{ duration: 3, repeat: Infinity }}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20"
        >
          <div className="relative">
            {/* 3D Girl Character Body */}
            <div className="w-20 h-48 bg-gradient-to-b from-white/20 to-brand/40 rounded-full border border-white/30 shadow-2xl backdrop-blur-md flex flex-col items-center pt-8">
              {/* School Bag */}
              <div className="absolute -right-4 top-12 w-12 h-16 bg-accent/80 rounded-xl border border-white/20 shadow-lg flex items-center justify-center">
                <div className="w-1 h-8 bg-white/20 rounded-full" />
              </div>
              {/* Head */}
              <div className="absolute -top-12 left-2 w-16 h-16 bg-accent/90 rounded-full border border-white/30 shadow-2xl flex items-center justify-center overflow-hidden">
                <div className="w-full h-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.4),transparent)]" />
              </div>
              {/* Legs (Animated when walking) */}
              {animationState === 'walking' && (
                <>
                  <motion.div 
                    animate={{ rotateX: [0, 30, 0, -30, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                    className="absolute -bottom-8 left-4 w-3 h-10 bg-brand/60 rounded-full origin-top"
                  />
                  <motion.div 
                    animate={{ rotateX: [0, -30, 0, 30, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                    className="absolute -bottom-8 right-4 w-3 h-10 bg-brand/60 rounded-full origin-top"
                  />
                </>
              )}
              {/* Glow */}
              <div className="absolute inset-0 bg-brand/20 blur-2xl rounded-full -z-10 animate-pulse" />
            </div>
          </div>
        </motion.div>

        {/* Team Members (Floating Orbs) */}
        {teamMembers.map((member, i) => (
          <motion.div
            key={i}
            animate={{ 
              y: [0, -30, 0],
              x: [0, i % 2 === 0 ? 20 : -20, 0],
              scale: [1, 1.1, 1]
            }}
            transition={{ duration: 4 + i, repeat: Infinity, ease: "easeInOut" }}
            className="absolute z-10"
            style={{ 
              left: `${20 + (i * 15)}%`, 
              top: `${30 + (i * 10)}%` 
            }}
          >
            <div className="relative group">
              <div className="w-16 h-16 rounded-full bg-white/10 border border-white/20 backdrop-blur-xl flex items-center justify-center shadow-2xl group-hover:border-brand/50 transition-all">
                <span className="text-brand font-black text-lg">{member.name[0].toUpperCase()}</span>
                {/* Status Ring */}
                <div className={`absolute -inset-1 rounded-full border-2 border-dashed ${member.progress > 0 ? 'border-brand animate-spin-slow' : 'border-white/10'}`} />
              </div>
              {/* Member Status Label */}
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-[9px] font-black text-white uppercase tracking-widest">
                {member.progress > 0 ? 'Synthesizing...' : 'Standby'}
              </div>
            </div>
          </motion.div>
        ))}

        {/* Status Overlay */}
        <div className="absolute top-10 left-10 z-40">
          <div className="glass-card px-6 py-4 rounded-2xl border border-white/10">
            <div className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mb-1">Animation Matrix</div>
            <div className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-brand animate-ping" />
              {animationState.toUpperCase()} MODE
            </div>
          </div>
        </div>
      </div>
    );
  };

  const TeamProgress = () => {
    return (
      <div className="glass-card p-12 rounded-[50px] border border-white/10 relative overflow-hidden mb-16 shadow-[0_30px_60px_rgba(0,0,0,0.5)]">
        {/* Animated Background Elements */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-brand/10 rounded-full blur-[120px] -mr-48 -mt-48 animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-accent/5 rounded-full blur-[100px] -ml-32 -mb-32" />
        
        {/* Data Grid Overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-12">
            <div>
              <div className="flex items-center gap-4 mb-2">
                <div className="w-1.5 h-6 bg-brand rounded-full" />
                <h3 className="text-3xl font-black uppercase tracking-tighter text-white">Research Timeline</h3>
              </div>
              <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.4em] ml-5">Real-time Collaborative Synthesis</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right hidden sm:block">
                <div className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-1">System Status</div>
                <div className="text-xs text-brand font-black uppercase tracking-widest flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-brand animate-ping" />
                  Synchronized
                </div>
              </div>
              <div className="w-20 h-20 rounded-3xl bg-brand/10 flex items-center justify-center border border-brand/20 shadow-2xl">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                  className="w-10 h-10 rounded-full border-2 border-dashed border-brand/40 flex items-center justify-center"
                >
                  <BrainCircuit size={20} className="text-brand" />
                </motion.div>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {teamMembers.length > 0 ? teamMembers.map((member, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: idx * 0.1, type: "spring" }}
                className="glass-card p-8 rounded-[32px] border border-white/5 hover:border-brand/40 transition-all group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-brand/5 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-brand/10 transition-colors" />
                
                <div className="flex items-center gap-5 mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-brand font-black text-xl border border-white/10 group-hover:border-brand/30 transition-all shadow-inner">
                    {member.name[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-black text-white uppercase tracking-widest group-hover:text-brand transition-colors">{member.name}</div>
                    <div className="text-[9px] text-white/20 font-black uppercase tracking-widest mt-1">Lead Researcher</div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="flex justify-between text-[11px] font-black uppercase tracking-widest">
                    <span className="text-white/30">Efficiency</span>
                    <span className="text-brand">{member.progress}%</span>
                  </div>
                  <div className="h-2.5 bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${member.progress}%` }}
                      className="h-full bg-gradient-to-r from-brand to-accent rounded-full shadow-[0_0_15px_rgba(66,133,244,0.5)] relative"
                    >
                      {/* Animated Particle on Bar */}
                      <motion.div 
                        animate={{ x: ['0%', '100%', '0%'] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="absolute top-0 left-0 w-4 h-full bg-white/40 blur-sm rounded-full"
                      />
                    </motion.div>
                  </div>
                  
                  <div className="pt-4 flex flex-wrap gap-2">
                    {member.assignedSectionIds.map(sid => (
                      <div key={sid} className="px-3 py-1 rounded-lg bg-white/5 text-[9px] font-black text-white/30 uppercase tracking-widest border border-white/5 group-hover:border-brand/20 transition-all">
                        {sid}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )) : (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-[40px] group hover:border-brand/20 transition-all">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-6">
                  <User className="text-white/20" size={32} />
                </div>
                <div className="text-white/20 text-xs font-black uppercase tracking-[0.4em]">Initialize Team Collaboration</div>
                <p className="text-white/10 text-[10px] mt-4 font-bold uppercase tracking-widest">Admin access required for member synchronization</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // --- UI Render ---
  return (
    <div className="min-h-screen bg-[#030712] text-white font-sans selection:bg-brand/30 selection:text-white relative overflow-hidden">
      <style>{`
        .glass-sidebar {
          background: #030712;
          box-shadow: inset 6px 6px 12px rgba(0, 0, 0, 0.6), 
                      inset -6px -6px 12px rgba(255, 255, 255, 0.03) !important;
        }
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
      <AnimatePresence>
        {!isLoggedIn ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-6 overflow-hidden"
          >
            {/* Animated Background Nodes */}
            <div className="absolute inset-0 bg-[#050505]">
              <div className="absolute inset-0 opacity-20" 
                   style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #4285f4 1px, transparent 0)', backgroundSize: '40px 40px' }} />
              <motion.div 
                animate={{ 
                  scale: [1, 1.2, 1],
                  opacity: [0.1, 0.2, 0.1]
                }}
                transition={{ duration: 10, repeat: Infinity }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-brand/10 rounded-full blur-[200px] pointer-events-none"
              />
            </div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="glass-card w-full max-w-2xl p-20 rounded-[80px] border border-white/10 relative overflow-hidden shadow-[0_50px_100px_rgba(0,0,0,0.8)]"
            >
              {/* Circuit Line Decoration */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-b from-brand to-transparent" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-t from-brand to-transparent" />
              <div className="absolute left-0 top-1/2 -translate-y-1/2 h-px w-24 bg-gradient-to-r from-brand to-transparent" />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 h-px w-24 bg-gradient-to-l from-brand to-transparent" />

              <div className="relative z-10 text-center">
                <div className="flex justify-center mb-12">
                  <motion.div 
                    animate={{ rotateY: 360 }}
                    transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                    className="w-28 h-28 rounded-[40px] bg-brand/10 flex items-center justify-center border border-brand/20 shadow-[0_0_50px_rgba(66,133,244,0.3)] group"
                  >
                    <BrainCircuit size={56} className="text-brand group-hover:scale-110 transition-transform" />
                  </motion.div>
                </div>
                
                <h1 className="text-7xl font-black uppercase tracking-tighter text-white mb-4 leading-none">
                  Priyanka<span className="text-brand">Tech</span>
                </h1>
                <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.6em] mb-16">Neural Synthesis Protocol v4.0 • Trishika Technologies</p>
                
                <div className="space-y-8 max-w-md mx-auto">
                  <div className="space-y-4">
                    <div className="relative group">
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-brand to-accent rounded-3xl blur opacity-10 group-hover:opacity-30 transition duration-1000"></div>
                      <div className="relative">
                        <User className="absolute left-8 top-1/2 -translate-y-1/2 text-white/20" size={20} />
                        <input 
                          type="text"
                          value={loginName}
                          onChange={(e) => setLoginName(e.target.value)}
                          placeholder="Researcher Identity"
                          className="w-full bg-black/40 border border-white/10 rounded-3xl pl-20 pr-8 py-6 text-white text-lg font-black tracking-widest focus:outline-none focus:border-brand/50 transition-all placeholder:text-white/10"
                        />
                      </div>
                    </div>

                    <div className="relative group">
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-brand to-accent rounded-3xl blur opacity-10 group-hover:opacity-30 transition duration-1000"></div>
                      <div className="relative">
                        <Zap className="absolute left-8 top-1/2 -translate-y-1/2 text-white/20" size={20} />
                        <input 
                          type="password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                          placeholder="Access Key"
                          className="w-full bg-black/40 border border-white/10 rounded-3xl pl-20 pr-8 py-6 text-white text-lg font-black tracking-widest focus:outline-none focus:border-brand/50 transition-all placeholder:text-white/10"
                        />
                      </div>
                    </div>
                  </div>

                  {loginError && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-red-500/10 border border-red-500/20 p-6 rounded-3xl flex items-center gap-4 text-red-400 text-[10px] font-black uppercase tracking-[0.2em]"
                    >
                      <AlertCircle size={20} />
                      Authentication Protocol Failed
                    </motion.div>
                  )}

                  <button 
                    onClick={handleLogin}
                    className="w-full bg-brand hover:bg-brand/90 text-white font-black py-6 rounded-3xl uppercase tracking-[0.4em] transition-all shadow-[0_0_40px_rgba(66,133,244,0.4)] hover:shadow-[0_0_60px_rgba(66,133,244,0.6)] hover:-translate-y-1 active:translate-y-0 relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    Initialize Portal
                  </button>

                  <div className="pt-10 flex flex-col items-center gap-8">
                    <div className="flex items-center gap-6 w-full">
                      <div className="h-px flex-1 bg-white/5" />
                      <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.4em]">External Nodes</span>
                      <div className="h-px flex-1 bg-white/5" />
                    </div>
                    
                    <button 
                      onClick={() => window.open('https://huggingface.co/settings/tokens', '_blank')}
                      className="flex items-center gap-4 px-10 py-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all group"
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
                      <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em] group-hover:text-white transition-colors">Sync with Hugging Face</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex h-screen bg-transparent text-white font-sans selection:bg-brand/30 selection:text-white relative overflow-hidden">
      {/* Background Elements */}
      <div className="noise-overlay" />
      
      {/* Animated Spheres */}
      <motion.div 
        animate={{ 
          y: [0, -40, 0],
          x: [0, 20, 0],
          scale: [1, 1.1, 1]
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        className="fixed -top-20 -left-20 w-96 h-96 bg-brand/20 rounded-full blur-[120px] pointer-events-none z-0"
      />
      <motion.div 
        animate={{ 
          y: [0, 50, 0],
          x: [0, -30, 0],
          scale: [1, 1.2, 1]
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        className="fixed -bottom-40 -right-40 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[150px] pointer-events-none z-0"
      />
      
      {/* Floating 3D Spheres (CSS Only) */}
      <motion.div 
        animate={{ y: [0, -20, 0], rotate: 360 }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        className="fixed top-1/4 left-10 w-24 h-24 bg-black rounded-full shadow-[inset_-10px_-10px_30px_rgba(255,255,255,0.1),0_0_50px_rgba(0,0,0,0.5)] z-10 hidden lg:block"
      />
      <motion.div 
        animate={{ y: [0, 30, 0], rotate: -360 }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        className="fixed bottom-1/4 right-20 w-32 h-32 bg-black rounded-full shadow-[inset_-15px_-15px_40px_rgba(255,255,255,0.1),0_0_60px_rgba(0,0,0,0.5)] z-10 hidden lg:block"
      />

      {/* Sticky Progress Header */}
      {step === 3 && (
        <motion.div 
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          className="fixed top-0 left-0 right-0 z-[100] bg-black/80 backdrop-blur-xl border-b border-white/10 px-8 py-3 flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center border border-brand/30">
              <BrainCircuit size={16} className="text-brand" />
            </div>
            <div>
              <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">Global Synthesis</div>
              <div className="text-xs text-white font-black uppercase tracking-tighter">
                {animationState === 'writing' ? 'Processing Research Nodes...' : 'Team Synchronizing...'}
              </div>
            </div>
          </div>
          
          <div className="flex-1 max-w-md mx-8">
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
              <motion.div 
                animate={{ width: `${Math.max(...teamMembers.map(m => m.progress), 0)}%` }}
                className="h-full bg-brand shadow-[0_0_15px_rgba(66,133,244,0.5)]"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[9px] font-black text-white/20 uppercase tracking-widest">Peak Efficiency</div>
              <div className="text-xs text-brand font-black">{Math.max(...teamMembers.map(m => m.progress), 0)}%</div>
            </div>
            <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-brand animate-ping" />
            </div>
          </div>
        </motion.div>
      )}

      {/* Sidebar */}
      <aside className="w-80 glass-sidebar flex flex-col z-20 border-r border-white/5 overflow-hidden">
        <div className="p-10 border-b border-white/5 bg-black/20">
          <div className="flex items-center gap-4 mb-3">
            <motion.div 
              whileHover={{ scale: 1.1, rotate: 10 }}
              className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand to-accent flex items-center justify-center text-white font-black shadow-2xl shadow-brand/40 border border-white/20"
            >
              P
            </motion.div>
            <div>
              <h1 className="font-sans font-black text-2xl tracking-tighter text-white leading-none">Priyanka</h1>
              <div className="text-[10px] font-black text-brand uppercase tracking-widest mt-1">Tech Studio</div>
            </div>
          </div>
          <p className="text-[9px] font-sans font-black text-white/20 uppercase tracking-[0.3em]">Trishika Technologies</p>
        </div>

        <div className="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar">
          {/* Branch Selection */}
          <section>
            <label className="text-[10px] font-sans font-black text-white/20 uppercase tracking-[0.3em] block mb-8">Engineering Domain</label>
            <div className="space-y-3">
              {BRANCHES.map(b => (
                <button
                  key={b}
                  onClick={() => { setBranch(b); setSelectedKeywords([]); }}
                  className={cn(
                    "w-full text-left px-6 py-4 rounded-2xl text-xs transition-all relative group overflow-hidden border",
                    branch === b 
                      ? "bg-white/10 text-white font-black border-white/20 shadow-[inset_4px_4px_10px_rgba(0,0,0,0.4)]" 
                      : "bg-transparent text-white/30 border-transparent hover:text-white hover:bg-white/5"
                  )}
                >
                  {branch === b && (
                    <motion.div layoutId="active-branch" className="absolute left-0 top-0 w-1.5 h-full bg-brand" />
                  )}
                  {b}
                </button>
              ))}
            </div>
          </section>

          {/* Keywords */}
          {branch && (
            <motion.section initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
              <label className="text-[10px] font-sans font-black text-white/30 uppercase tracking-[0.25em] block mb-6">Research Keywords</label>
              <div className="flex flex-wrap gap-2.5">
                {KEYWORDS[branch as keyof typeof KEYWORDS].map(kw => (
                  <button
                    key={kw}
                    onClick={() => toggleKeyword(kw)}
                    className={cn(
                      "px-4 py-2 rounded-full text-[11px] font-bold transition-all border",
                      selectedKeywords.includes(kw) 
                        ? "bg-brand text-white border-brand shadow-lg shadow-brand/30" 
                        : "bg-white/5 text-white/60 border-white/10 hover:border-white/30 hover:text-white"
                    )}
                  >
                    {kw}
                  </button>
                ))}
              </div>
            </motion.section>
          )}

          {/* Team Management (Admin Only) */}
          {userRole === 'admin' && (
            <section className="pt-6 border-t border-white/5">
              <label className="text-[10px] font-sans font-black text-white/30 uppercase tracking-[0.25em] block mb-6">Team Collaboration</label>
              <button 
                onClick={() => setShowTeamModal(true)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold flex items-center justify-center gap-2 hover:bg-white/10 transition-all"
              >
                <User size={14} />
                Manage Research Team
              </button>
            </section>
          )}

          {/* Hugging Face Config */}
          {userRole === 'admin' && (
            <section className="pt-6 border-t border-white/5">
              <label className="text-[10px] font-sans font-black text-white/30 uppercase tracking-[0.25em] block mb-6">Hugging Face MCP</label>
              {hfToken ? (
                <div className="flex items-center gap-3 p-4 bg-brand/10 rounded-2xl border border-brand/20">
                  <CheckCircle2 className="text-brand" size={16} />
                  <span className="text-xs font-bold text-brand uppercase tracking-widest">Connected</span>
                  <button 
                    onClick={() => setHfToken("")}
                    className="ml-auto text-[10px] text-white/40 hover:text-white underline"
                  >
                    Reset
                  </button>
                </div>
              ) : (
                <input 
                  type="password"
                  value={hfToken}
                  onChange={(e) => setHfToken(e.target.value)}
                  placeholder="Enter READ Token"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-brand/50 transition-all placeholder:text-white/10"
                />
              )}
            </section>
          )}

          {/* Settings */}
          <section className="pt-6 border-t border-white/5">
            <label className="text-[10px] font-sans font-black text-white/30 uppercase tracking-[0.25em] block mb-6">Advanced Config</label>
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <BrainCircuit size={16} className="text-accent" />
                  <span className="text-xs font-bold text-white/80">High Thinking</span>
                </div>
                <button 
                  onClick={() => setIsHighThinking(!isHighThinking)}
                  className={cn(
                    "w-11 h-6 rounded-full relative transition-all duration-300",
                    isHighThinking ? "bg-brand" : "bg-white/10"
                  )}
                >
                  <motion.div 
                    animate={{ x: isHighThinking ? 22 : 4 }}
                    className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-md"
                  />
                </button>
              </div>
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                <div className="text-[9px] font-sans font-black text-white/30 uppercase mb-2">AI Engine</div>
                <div className="text-xs text-accent flex items-center gap-2 font-bold">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  {isHighThinking ? "Gemini 3.1 Pro" : "Llama 3.1 405B"}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="p-8 border-t border-white/5">
          <button
            disabled={!branch || selectedKeywords.length === 0 || isGeneratingTopics}
            onClick={step === 1 ? generateTopics : step === 2 ? startThesisGeneration : undefined}
            className={cn(
              "w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all",
              (!branch || selectedKeywords.length === 0 || isGeneratingTopics) 
                ? "bg-white/5 text-white/20 cursor-not-allowed" 
                : "bg-white text-black hover:bg-brand hover:text-white shadow-xl hover:shadow-brand/40"
            )}
          >
            {isGeneratingTopics ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>
                {step === 1 ? "Generate Topics" : step === 2 ? "Construct Thesis" : "Complete"}
                <ChevronRight size={18} />
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative z-20">
        {/* Top Header */}
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-10 bg-black/20 backdrop-blur-md">
          <div className="flex items-center gap-8">
            <h2 className="text-[11px] font-sans font-black text-white/40 uppercase tracking-[0.3em] flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-brand shadow-[0_0_10px_rgba(66,133,244,0.8)]" />
              {step === 1 && "Domain Selection"}
              {step === 2 && <>Research Topics for <span className="text-brand">{branch}</span></>}
              {step >= 3 && <>Thesis Construction: <span className="text-brand">{selectedTopicIndices.length > 0 ? topics[selectedTopicIndices[0]].title : "Draft"}</span></>}
            </h2>
            {step === 4 && (
              <button 
                onClick={downloadDocx}
                className="bg-white hover:bg-brand hover:text-white text-black text-[10px] font-black uppercase tracking-widest px-6 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-xl"
              >
                <Download size={14} />
                Download .docx
              </button>
            )}
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5 px-4 py-1.5 bg-brand/10 rounded-full border border-brand/20">
              <ShieldCheck size={14} className="text-brand" />
              <span className="text-[10px] font-sans font-black text-brand uppercase tracking-widest">Humanized</span>
            </div>
            <div className="flex items-center gap-2.5 px-4 py-1.5 bg-white/5 rounded-full border border-white/10">
              <Cpu size={14} className="text-white/60" />
              <span className="text-[10px] font-sans font-black text-white/60 uppercase tracking-widest">NVIDIA NIM</span>
            </div>
          </div>
        </header>

        {/* Body */}
        <div ref={mainBodyRef} className="flex-1 overflow-y-auto p-12 custom-scrollbar">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div 
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -40 }}
                className="h-full flex flex-col items-center justify-center text-center max-w-4xl mx-auto"
              >
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="w-24 h-24 rounded-3xl bg-gradient-to-br from-brand to-accent flex items-center justify-center text-5xl text-white font-sans font-black mb-10 shadow-2xl shadow-brand/30"
                >
                  P
                </motion.div>
                <h3 className="font-sans text-7xl font-black mb-8 text-white tracking-tighter leading-[0.9]">
                  The Future of <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-accent">Thesis Generation.</span>
                </h3>
                <p className="text-white/50 text-xl leading-relaxed mb-16 max-w-2xl font-medium">
                  Select your engineering branch and keywords to begin. Our system uses NVIDIA NIM models 
                  and 24 proprietary linguistic rules to generate MTech/PhD level research that bypasses AI detection.
                </p>
                <div className="grid grid-cols-3 gap-6 w-full">
                  {[
                    { t: '01', l: 'Select Domain', d: 'Branch + keywords from curated panels' },
                    { t: '02', l: 'Pick Topics', d: 'Pick topics for single or comparative study' },
                    { t: '03', l: 'Generate', d: 'Full 5-chapter thesis generated as .docx' }
                  ].map(h => (
                    <div key={h.t} className="glass-card p-8 rounded-3xl text-left hover:bg-white/10 transition-all group">
                      <div className="text-4xl font-sans font-black text-brand/20 group-hover:text-brand/40 transition-colors mb-4">{h.t}</div>
                      <div className="text-[10px] font-sans font-black text-brand uppercase tracking-widest mb-2">{h.l}</div>
                      <div className="text-sm text-white/60 leading-relaxed">{h.d}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div 
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -40 }}
                className="space-y-12"
              >
                <div className="flex items-end justify-between">
                  <div>
                    <h3 className="text-5xl font-black text-white tracking-tighter mb-4">Research Topics</h3>
                    <p className="text-white/50 font-medium">Select a topic to begin constructing your thesis chapters.</p>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Selected</div>
                    <div className="text-3xl font-black text-brand">{selectedTopicIndices.length} / 1</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {isGeneratingTopics ? (
                    <div className="col-span-full flex flex-col items-center justify-center py-20 gap-6">
                      <div className="relative">
                        <Loader2 className="animate-spin text-brand" size={64} />
                        <div className="absolute inset-0 blur-xl bg-brand/20 animate-pulse" />
                      </div>
                      <p className="font-sans font-black text-sm text-white/40 uppercase tracking-[0.3em] animate-pulse">Consulting NVIDIA NIM Knowledge Base...</p>
                    </div>
                  ) : (
                    topics.map((t, i) => (
                      <motion.div 
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        onClick={() => toggleTopicSelection(i)}
                        className={cn(
                          "glass-card p-8 rounded-3xl cursor-pointer transition-all relative overflow-hidden group",
                          selectedTopicIndices.includes(i) ? "border-brand bg-brand/10" : "hover:border-white/20"
                        )}
                      >
                        {selectedTopicIndices.includes(i) && (
                          <div className="absolute top-0 right-0 p-4">
                            <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center">
                              <Check size={14} className="text-white" />
                            </div>
                          </div>
                        )}
                        <div className="text-[10px] font-black text-brand uppercase tracking-widest mb-4">Topic {i + 1}</div>
                        <h4 className="text-xl font-black text-white mb-4 leading-tight group-hover:text-brand transition-colors">{t.title}</h4>
                        <p className="text-sm text-white/50 leading-relaxed mb-6">{t.description}</p>
                        <div className="flex flex-wrap gap-3">
                          <span className="px-3 py-1 bg-white/5 rounded-lg text-[10px] font-black text-white/40 uppercase tracking-widest">{t.type}</span>
                          {t.tags.map(tag => (
                            <span key={tag} className="px-3 py-1 bg-white/5 rounded-lg text-[10px] font-black text-white/40 uppercase tracking-widest">{tag}</span>
                          ))}
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {step >= 3 && (
              <motion.div 
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-12 max-w-5xl mx-auto"
              >
                <TeamAnimation />
                <TeamProgress />
                {/* Progress Indicator */}
                <div className="glass-card rounded-[32px] overflow-hidden">
                  <div className="bg-white/5 px-10 py-6 border-b border-white/5 flex justify-between items-center">
                    <div className="text-[11px] font-sans font-black text-white/40 uppercase tracking-[0.3em]">Generation Progress</div>
                    <div className="text-[11px] font-sans font-black text-brand uppercase tracking-widest bg-brand/10 px-4 py-1.5 rounded-full border border-brand/20">
                      {thesisSections.length} / {SECTIONS_CONFIG.length} Chapters
                    </div>
                  </div>
                  <div className="p-10 grid grid-cols-2 md:grid-cols-5 gap-8">
                    {SECTIONS_CONFIG.map((s, i) => {
                      const isDone = i < thesisSections.length;
                      const isCurrent = i === currentGeneratingIndex;
                      return (
                        <div key={i} className="space-y-4">
                          <div className={cn(
                            "flex flex-col items-center gap-3 text-[10px] font-black uppercase tracking-widest transition-all",
                            isDone ? "text-brand" : isCurrent ? "text-accent animate-pulse" : "text-white/20"
                          )}>
                            <div className={cn(
                              "w-3 h-3 rounded-full border-2 transition-all duration-500",
                              isDone ? "bg-brand border-brand shadow-[0_0_10px_rgba(66,133,244,0.8)]" : isCurrent ? "bg-accent border-accent animate-ping" : "border-white/10"
                            )} />
                            {s.n}
                          </div>
                          <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 shadow-inner">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: isDone ? '100%' : isCurrent ? '100%' : '0%' }}
                              transition={{ duration: isCurrent ? 10 : 0.5 }}
                              className={cn(
                                "h-full transition-all duration-500", 
                                isDone ? "bg-brand shadow-[0_0_15px_rgba(66,133,244,0.6)]" : "bg-accent shadow-[0_0_15px_rgba(242,125,38,0.6)]"
                              )}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Thesis Content */}
                <div className="space-y-12 pb-32">
                  {thesisSections
                    .filter(s => {
                      if (userRole === 'admin') return true;
                      const member = teamMembers.find(m => m.name.toLowerCase() === loginName.toLowerCase());
                      const sectionId = SECTIONS_CONFIG.find(sc => sc.n === s.title)?.id;
                      return member?.assignedSectionIds.includes(sectionId || "");
                    })
                    .map((section, idx) => (
                    <motion.article 
                      key={idx}
                      initial={{ opacity: 0, y: 40 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass-card rounded-[40px] overflow-hidden group"
                    >
                      <div className="px-10 py-6 bg-white/5 border-b border-white/5 flex justify-between items-center">
                        <h5 className="font-sans font-black text-white uppercase tracking-widest text-sm">{section.title}</h5>
                        <button 
                          onClick={() => copyToClipboard(section.content, idx)}
                          className="text-white/40 hover:text-brand transition-all flex items-center gap-3 text-[10px] font-sans font-black uppercase tracking-[0.2em]"
                        >
                          {copiedIndex === idx ? <Check size={14} /> : <Copy size={14} />}
                          {copiedIndex === idx ? "Copied" : "Copy Section"}
                        </button>
                      </div>
                      <div className="p-12 prose prose-invert max-w-none">
                        <div className="text-white/70 leading-[2] text-lg font-medium space-y-6 whitespace-pre-wrap">
                          {section.content}
                        </div>
                      </div>
                    </motion.article>
                  ))}
                  
                  {currentGeneratingIndex !== -1 && (
                    <div className="flex flex-col items-center justify-center py-20 gap-8">
                      <div className="relative">
                        <Loader2 className="animate-spin text-brand" size={48} />
                        <div className="absolute inset-0 blur-2xl bg-brand/30 animate-pulse" />
                      </div>
                      <p className="font-sans font-black text-xs text-white/40 uppercase tracking-[0.4em] animate-pulse">
                        Synthesizing {SECTIONS_CONFIG[currentGeneratingIndex].n}...
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Error Toast */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-red-500/10 border border-red-500/50 text-red-500 px-6 py-3 rounded-full text-xs font-mono flex items-center gap-3 backdrop-blur-md z-50"
          >
            <AlertCircle size={16} />
            {error}
            <button onClick={() => setError(null)} className="ml-4 hover:underline">Dismiss</button>
          </motion.div>
        )}

        {/* Gemini Chat Widget */}
        <div className="fixed bottom-6 right-6 z-40">
          <AnimatePresence>
            {isChatOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 40 }}
                className="mb-6 w-[400px] h-[600px] glass-card rounded-[32px] shadow-2xl flex flex-col overflow-hidden border border-white/10"
              >
                <div className="p-6 bg-white/5 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-brand/20 flex items-center justify-center">
                      <Bot size={20} className="text-brand" />
                    </div>
                    <div>
                      <div className="font-black text-xs text-white uppercase tracking-widest">Priyanka AI</div>
                      <div className="text-[9px] font-black text-brand uppercase tracking-[0.2em]">Research Advisor</div>
                    </div>
                  </div>
                  <button onClick={() => setIsChatOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/5 flex items-center justify-center transition-colors">
                    <X size={18} className="text-white/40" />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-black/20">
                  {chatMessages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center px-8">
                      <div className="w-16 h-16 rounded-3xl bg-brand/10 flex items-center justify-center mb-6">
                        <Sparkles className="text-brand" size={32} />
                      </div>
                      <h4 className="text-white font-black text-sm mb-2 uppercase tracking-widest">Intelligent Advisor</h4>
                      <p className="text-[11px] text-white/40 leading-relaxed font-medium">Ask me anything about your research methodology, thesis structure, or technical domain.</p>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[85%] p-4 rounded-2xl text-[13px] leading-relaxed font-medium shadow-xl",
                        msg.role === 'user' ? "bg-brand text-white" : "glass-card text-white/80 border-white/5"
                      )}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="glass-card p-4 rounded-2xl flex gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-6 bg-white/5 border-t border-white/5 flex gap-3">
                  <input 
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                    placeholder="Ask Priyanka..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/50 transition-all"
                  />
                  <button 
                    onClick={sendChatMessage}
                    disabled={!chatInput.trim() || isChatLoading}
                    className="w-12 h-12 rounded-2xl bg-brand text-white flex items-center justify-center hover:bg-brand/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-4 justify-end">
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsLiveVoiceOpen(true)}
              className="w-16 h-16 rounded-3xl bg-accent text-white flex items-center justify-center shadow-2xl shadow-accent/40 relative group overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <Mic size={28} />
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsChatOpen(!isChatOpen)}
              className="w-16 h-16 rounded-3xl bg-brand text-white flex items-center justify-center shadow-2xl shadow-brand/40 relative group overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              {isChatOpen ? <X size={28} /> : <MessageSquare size={28} />}
            </motion.button>
          </div>
        </div>

        {/* Live Voice Overlay */}
        <AnimatePresence>
          {isLiveVoiceOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-2xl z-[100] flex flex-col items-center justify-center p-6"
            >
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div 
                  animate={{ 
                    scale: [1, 1.2, 1],
                    opacity: [0.1, 0.2, 0.1],
                    x: [0, 50, 0],
                    y: [0, -50, 0]
                  }}
                  transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-brand/20 rounded-full blur-[120px]"
                />
                <motion.div 
                  animate={{ 
                    scale: [1.2, 1, 1.2],
                    opacity: [0.1, 0.2, 0.1],
                    x: [0, -50, 0],
                    y: [0, 50, 0]
                  }}
                  transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-accent/20 rounded-full blur-[100px]"
                />
              </div>

              <button 
                onClick={() => { stopLiveVoice(); setIsLiveVoiceOpen(false); }}
                className="absolute top-12 right-12 w-14 h-14 rounded-full glass-card flex items-center justify-center hover:bg-white/10 transition-all border border-white/10"
              >
                <X size={24} className="text-white/60" />
              </button>

              <div className="relative w-80 h-80 flex items-center justify-center mb-16">
                <motion.div 
                  animate={{ 
                    scale: isLiveActive ? [1, 1.4, 1] : 1,
                    opacity: isLiveActive ? [0.2, 0.4, 0.2] : 0.1
                  }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute inset-0 rounded-full bg-brand blur-3xl"
                />
                <motion.div 
                  animate={{ 
                    rotate: isLiveActive ? 360 : 0
                  }}
                  transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                  className="absolute inset-0 rounded-full border-2 border-dashed border-white/10"
                />
                <div className="relative z-10 w-48 h-48 rounded-full glass-card flex items-center justify-center shadow-2xl border border-white/20">
                  <div className={cn(
                    "w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500",
                    isLiveActive ? "bg-brand shadow-[0_0_50px_rgba(66,133,244,0.5)]" : "bg-white/5"
                  )}>
                    {isLiveActive ? <Mic size={56} className="text-white" /> : <MicOff size={56} className="text-white/20" />}
                  </div>
                </div>
              </div>

              <div className="text-center max-w-2xl relative z-10">
                <h2 className="text-4xl font-black text-white mb-4 uppercase tracking-widest">Live Research Advisor</h2>
                <div className="h-24 flex items-center justify-center">
                  <p className="text-lg text-white/60 font-medium leading-relaxed italic">
                    {liveTranscript || "Connect to start a real-time voice conversation with your PhD advisor."}
                  </p>
                </div>
              </div>

              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={isLiveActive ? stopLiveVoice : startLiveVoice}
                className={cn(
                  "mt-12 px-16 py-6 rounded-full font-black text-xl uppercase tracking-widest transition-all shadow-2xl relative overflow-hidden group",
                  isLiveActive 
                    ? "bg-red-500 text-white shadow-red-500/20" 
                    : "bg-brand text-white shadow-brand/20"
                )}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                {isLiveActive ? "End Session" : "Start Conversation"}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      </div>
      {/* Team Management Modal */}
      <AnimatePresence>
        {showTeamModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl"
          >
            <div className="glass-card p-10 rounded-[40px] w-full max-w-lg border border-white/10 relative overflow-hidden">
              <button 
                onClick={() => setShowTeamModal(false)}
                className="absolute top-8 right-8 text-white/40 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
              
              <h3 className="text-3xl font-black uppercase tracking-widest mb-8">Team Management</h3>
              
              <div className="space-y-8">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-4">Member Name</label>
                    <input 
                      type="text"
                      value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-brand/50 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-4">Access Key</label>
                    <input 
                      type="password"
                      value={newMemberPassword}
                      onChange={(e) => setNewMemberPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-brand/50 transition-all"
                    />
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <button 
                    onClick={addTeamMember}
                    className="flex-1 bg-white text-black py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-brand hover:text-white transition-all"
                  >
                    Add Member
                  </button>
                  <button 
                    onClick={assignSectionsToTeam}
                    className="flex-1 bg-brand/20 text-brand border border-brand/30 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-brand hover:text-white transition-all"
                  >
                    Auto-Assign
                  </button>
                </div>

                <div className="pt-8 border-t border-white/5 max-h-[300px] overflow-y-auto custom-scrollbar space-y-3">
                  {teamMembers.map((m, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center text-brand font-black">{m.name[0]}</div>
                        <div>
                          <div className="text-xs font-black text-white uppercase tracking-widest">{m.name}</div>
                          <div className="text-[9px] text-white/30 font-bold uppercase tracking-widest">{m.assignedSectionIds.length} Sections Assigned</div>
                        </div>
                      </div>
                      <button 
                        onClick={() => setTeamMembers(teamMembers.filter((_, idx) => idx !== i))}
                        className="text-red-500/40 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
