import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  Upload,
  Eraser,
  Pen,
  Settings,
  Play,
  Trash,
  Download,
  Copy,
  FileText,
  CheckCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { jsPDF } from "jspdf"; // UMD-friendly
import "katex/dist/katex.min.css"; // garante CSS em build local

// ==============================================
//  Solucionador por Imagem — Markdown + LaTeX
//  + PDF + Checagem Simbólica + Painel de Config
//  (CLIENTE usa SEMPRE /api/solve; chave fica no servidor)
// ==============================================

export default function App() {
  // ==== Canvas & câmera ====
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const videoRef = useRef(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [penSize, setPenSize] = useState(4);
  const [isEraser, setIsEraser] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [stream, setStream] = useState(null);

  // ==== App state ====
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [output, setOutput] = useState(""); // SEMPRE string para ReactMarkdown
  const [prompt, setPrompt] = useState(
    "Interprete o problema desta imagem e resolva-o passo a passo. Use Markdown e LaTeX ($…$, $$…$$). Termine com uma seção **Resposta** destacando o resultado final."
  );

  // ==== Config (somente para o backend saber o modelo) ====
  const [provider, setProvider] = useState("openai"); // 'openai' | 'openrouter'
  const [model, setModel] = useState("gpt-4o-mini"); // modelo com visão
  const [temperature, setTemperature] = useState(0.2);
  const [showSettings, setShowSettings] = useState(false);

  // (não enviamos apiKey do cliente; fica no servidor)

  // Carrega jsPDF e nerdamer via CDN uma vez
  useEffect(() => {
    const loadScript = (id, src) => new Promise((resolve, reject) => {
      if (document.getElementById(id)) return resolve();
      const s = document.createElement('script');
      s.id = id; s.src = src; s.async = true;
      s.onload = resolve; s.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
      document.body.appendChild(s);
    });
    (async () => {
      try {
        await loadScript('jspdf-cdn', 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
        await loadScript('nerdamer-core', 'https://cdn.jsdelivr.net/npm/nerdamer@1.1.13/nerdamer.core.min.js');
        await loadScript('nerdamer-algebra', 'https://cdn.jsdelivr.net/npm/nerdamer@1.1.13/Algebra.js');
        await loadScript('nerdamer-calc', 'https://cdn.jsdelivr.net/npm/nerdamer@1.1.13/Calculus.js');
        await loadScript('nerdamer-solve', 'https://cdn.jsdelivr.net/npm/nerdamer@1.1.13/Solve.js');
      } catch (e) {
        console.warn(e);
      }
    })();
  }, []);

  // ==== Checagem simbólica ====
  const [lhs, setLhs] = useState("");
  const [rhs, setRhs] = useState("");
  const [checkMsg, setCheckMsg] = useState("");

  const WIDTH = 900;
  const HEIGHT = 600;

  // ---- Persistência leve ----
  useEffect(() => {
    const saved = localStorage.getItem("img-solve-settings");
    if (!saved) return;
    try {
      const cfg = JSON.parse(saved);
      setProvider(cfg.provider ?? "openai");
      setModel(cfg.model ?? "gpt-4o-mini");
      setTemperature(typeof cfg.temperature === "number" ? cfg.temperature : 0.2);
      setPrompt(cfg.prompt ?? prompt);
    } catch {}
  }, []);

  const saveSettings = () => {
    localStorage.setItem(
      "img-solve-settings",
      JSON.stringify({ provider, model, temperature, prompt })
    );
  };

  // ---- Inicializa o canvas ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");
    ctxRef.current = ctx;
    // Fundo escuro e grade
    ctx.fillStyle = "#0b0f19";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawGrid(ctx);
  }, []);

  const drawGrid = (ctx) => {
    ctx.save();
    ctx.strokeStyle = "#1b2336";
    ctx.lineWidth = 1;
    for (let x = 0; x < WIDTH; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < HEIGHT; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();
  };

  // ---- Desenho no canvas ----
  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return {
        x: ((e.touches[0].clientX - rect.left) / rect.width) * WIDTH,
        y: ((e.touches[0].clientY - rect.top) / rect.height) * HEIGHT,
      };
    }
    return {
      x: ((e.clientX - rect.left) / rect.width) * WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * HEIGHT,
    };
  };

  const startDraw = (e) => {
    e.stopPropagation();
    const { x, y } = getPos(e);
    const ctx = ctxRef.current;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = penSize;
    ctx.strokeStyle = isEraser ? "rgba(0,0,0,1)" : "#e6edf7";
    ctx.globalCompositeOperation = isEraser ? "destination-out" : "source-over";
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const { x, y } = getPos(e);
    const ctx = ctxRef.current;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => {
    if (!isDrawing) return;
    ctxRef.current.closePath();
    setIsDrawing(false);
  };

  // ---- Upload de imagem ----
  const onUpload = (file) => {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const ctx = ctxRef.current;
      ctx.fillStyle = "#0b0f19";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      drawGrid(ctx);
      const scale = Math.min(WIDTH / img.width, HEIGHT / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const dx = (WIDTH - w) / 2;
      const dy = (HEIGHT - h) / 2;
      ctx.drawImage(img, dx, dy, w, h);
    };
    const reader = new FileReader();
    reader.onload = () => (img.src = reader.result);
    reader.readAsDataURL(file);
  };

  // ---- Câmera ----
  const openCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
      setStream(s);
      setCameraOn(true);
    } catch (e) {
      alert("Não foi possível acessar a câmera: " + e.message);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const temp = document.createElement("canvas");
    temp.width = v.videoWidth;
    temp.height = v.videoHeight;
    const tctx = temp.getContext("2d");
    tctx.drawImage(v, 0, 0);

    const img = new Image();
    img.onload = () => {
      const ctx = ctxRef.current;
      ctx.fillStyle = "#0b0f19";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      drawGrid(ctx);
      const scale = Math.min(WIDTH / img.width, HEIGHT / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const dx = (WIDTH - w) / 2;
      const dy = (HEIGHT - h) / 2;
      ctx.drawImage(img, dx, dy, w, h);
    };
    img.src = temp.toDataURL("image/png");
  };

  const closeCamera = () => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    setCameraOn(false);
    setStream(null);
  };

  // ---- Utilidades ----
  const clearCanvas = () => {
    const ctx = ctxRef.current;
    ctx.fillStyle = "#0b0f19";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawGrid(ctx);
  };

  const downloadImage = () => {
    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "problema.png";
    a.click();
  };

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(output || "");
    } catch {}
  };

  // ---- Exportar PDF (simples: cabeçalho + imagem do canvas + texto renderizado como plain) ----
  const exportPDF = () => {
    try {
      setPdfLoading(true);
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) throw new Error("jsPDF não carregado");
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const margin = 40;
      const pageW = pdf.internal.pageSize.getWidth();
      let y = margin;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text("Solucionador por Imagem — Relatório", margin, y);
      y += 18;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(new Date().toLocaleString(), margin, y);
      y += 12;

      const img = canvasRef.current.toDataURL("image/png");
      const imgW = pageW - margin * 2;
      const imgH = (imgW * 2) / 3; // proporção aproximada
      pdf.addImage(img, "PNG", margin, y, imgW, imgH, undefined, "FAST");
      y += imgH + 18;

      // Texto (sem KaTeX) — para LaTeX fiel, usar html2canvas no futuro
      const text = (output || "");
      const lines = pdf.splitTextToSize(text, pageW - margin * 2);
      lines.forEach((line) => {
        if (y > pdf.internal.pageSize.getHeight() - margin) {
          pdf.addPage();
          y = margin;
        }
        pdf.text(line, margin, y);
        y += 14;
      });

      pdf.save("solucao.pdf");
    } catch (e) {
      alert("Falha ao gerar PDF: " + e.message);
    } finally {
      setPdfLoading(false);
    }
  };

  // ---- Chamar backend proxy (/api/solve) ----
  const solve = async () => {
    setLoading(true);
    setOutput("");
    try {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      const res = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model, temperature, dataUrl, prompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const text = json?.content ?? json?.choices?.[0]?.message?.content ?? "";
      setOutput(typeof text === "string" && text ? text : JSON.stringify(json));
    } catch (err) {
      setOutput(`❌ Erro: ${err.message}. Dica: rode um servidor que exponha /api/solve com a sua API key no backend.`);
    } finally {
      setLoading(false);
    }
  };

  // ---- Checagem simbólica com nerdamer ----
  const runSymbolicCheck = () => {
    try {
      setCheckMsg("");
      const L = lhs.trim();
      const R = rhs.trim();
      if (!L || !R) throw new Error("Preencha LHS e RHS.");
      const diffExpr = nerdamer(`(${L})-(${R})`).expand();
      const diff = diffExpr.toString();
      let ok = diff === "0";
      if (!ok) {
        const vars = Array.from(new Set((L + R).match(/[a-zA-Z]\w*/g) || [])).filter(
          (v) => !["e", "pi", "sin", "cos", "tan", "log", "ln", "sqrt"].includes(v)
        );
        if (vars.length) {
          ok = true;
          for (let i = 0; i < 5; i++) {
            let expr = nerdamer(`(${L})-(${R})`);
            const subs = {};
            vars.forEach((v) => {
              subs[v] = (i + 2) * 0.37 + (v.charCodeAt(0) % 5);
            });
            expr = expr.evaluate(subs);
            const val = parseFloat(expr.text());
            if (!Number.isFinite(val) || Math.abs(val) > 1e-6) {
              ok = false;
              break;
            }
          }
        }
      }
      setCheckMsg(ok ? "✅ As expressões parecem equivalentes." : `⚠️ Diferença simbólica: ${diff}`);
    } catch (e) {
      setCheckMsg("❌ Erro na checagem: " + e.message);
    }
  };

  // ---- UI ----
  const safeOutput = typeof output === "string" ? output : ""; // garante string para ReactMarkdown

  return (
    <div className="min-h-screen bg-[#050814] text-slate-200 p-4">
      <div className="flex justify-between mb-4">
        <h1 className="text-2xl font-semibold">Solucionador por Imagem</h1>
        <div className="flex gap-2">
          <button
            onClick={exportPDF}
            disabled={pdfLoading}
            className="bg-slate-800 hover:bg-slate-700 rounded-xl px-3 py-2 flex items-center gap-2"
          >
            <FileText size={16} /> {pdfLoading ? "Gerando PDF..." : "PDF"}
          </button>
          <button
            onClick={runSymbolicCheck}
            className="bg-slate-800 hover:bg-slate-700 rounded-xl px-3 py-2 flex items-center gap-2"
          >
            <CheckCircle size={16} /> Checar
          </button>
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="bg-slate-800 hover:bg-slate-700 rounded-xl px-3 py-2 flex items-center gap-2"
          >
            <Settings size={16} /> Configurações
          </button>
        </div>
      </div>

      {showSettings && (
        <section className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/60 rounded-2xl p-4">
          <div>
            <label className="block text-sm mb-1">Provedor</label>
            <select
              className="w-full bg-slate-800 rounded-xl px-3 py-2"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="openai">OpenAI</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Modelo (com visão)</label>
            <input
              className="w-full bg-slate-800 rounded-xl px-3 py-2"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider === "openai" ? "gpt-4o-mini" : "openai/gpt-4o-mini"}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Temperatura</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="text-sm opacity-80">{temperature.toFixed(2)}</div>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">Prompt</label>
            <textarea
              className="w-full bg-slate-800 rounded-xl px-3 py-2 min-h-[80px]"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
          <div className="md:col-span-2 flex gap-2">
            <button onClick={saveSettings} className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2">
              Salvar
            </button>
            <button onClick={() => localStorage.removeItem("img-solve-settings")} className="rounded-xl bg-slate-700 hover:bg-slate-600 px-4 py-2">
              Limpar prefs
            </button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <label className="inline-flex items-center gap-2 bg-slate-800 rounded-xl px-3 py-2">
              <Pen className="w-4 h-4" />
              <input
                type="range"
                min={1}
                max={20}
                value={penSize}
                onChange={(e) => setPenSize(parseInt(e.target.value))}
              />
              <span className="text-sm w-8 text-right">{penSize}</span>
            </label>
            <button
              onClick={() => setIsEraser(false)}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 ${
                !isEraser ? "bg-indigo-600" : "bg-slate-800 hover:bg-slate-700"
              }`}
              title="Caneta"
            >
              <Pen className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsEraser(true)}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 ${
                isEraser ? "bg-indigo-600" : "bg-slate-800 hover:bg-slate-700"
              }`}
              title="Borracha"
            >
              <Eraser className="w-4 h-4" />
            </button>
            <label className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-2 cursor-pointer">
              <Upload className="w-4 h-4" /> Upload
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onUpload(e.target.files?.[0])}
              />
            </label>
            <button
              onClick={openCamera}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-2"
              title="Abrir câmera"
            >
              <Camera className="w-4 h-4" />
            </button>
            <button onClick={downloadImage} className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-2">
              <Download className="w-4 h-4" /> PNG
            </button>
            <button onClick={clearCanvas} className="inline-flex items-center gap-2 rounded-xl bg-rose-700 hover:bg-rose-600 px-3 py-2 ml-auto">
              <Trash className="w-4 h-4" /> Limpar
            </button>
          </div>

          <canvas
            ref={canvasRef}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
            className="border border-slate-700 rounded-lg w-full h-auto touch-none"
            style={{ touchAction: 'none' }}
          />

          <div className="mt-2 flex gap-2">
            <button
              onClick={solve}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 rounded-xl px-4 py-2 flex items-center gap-2"
            >
              <Play size={16} /> {loading ? "Resolvendo..." : "Resolver"}
            </button>
          </div>
        </div>

        <div className="bg-slate-900/60 rounded-xl p-4 overflow-auto min-h-[260px]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Solução (Markdown + LaTeX)</h2>
            <button onClick={copyResult} className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-2">
              <Copy className="w-4 h-4" /> Copiar
            </button>
          </div>
          <div id="solution-area" className="bg-slate-950/50 rounded-xl p-4 border border-slate-800 overflow-auto">
            {/* react-markdown v9: sem className direto; envolva em um wrapper */}
            <div className="prose prose-invert max-w-none break-words">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {safeOutput || `Desenhe ou carregue a questão e clique em **Resolver**.

**Exemplo**: $$(x+1)^2 = x^2+2x+1$$`}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>

      {/* Checagem simbólica */}
      <section className="mt-6 bg-slate-900/60 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Checagem Simbólica</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm opacity-80">LHS (esquerda)</label>
            <input value={lhs} onChange={(e) => setLhs(e.target.value)} className="w-full bg-slate-800 rounded-xl px-3 py-2" placeholder="ex.: (x+1)^2" />
          </div>
          <div>
            <label className="text-sm opacity-80">RHS (direita)</label>
            <input value={rhs} onChange={(e) => setRhs(e.target.value)} className="w-full bg-slate-800 rounded-xl px-3 py-2" placeholder="ex.: x^2+2x+1" />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button onClick={runSymbolicCheck} className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2">Checar</button>
          <div className="text-sm opacity-90">{checkMsg}</div>
        </div>
      </section>

      {/* Dev tests opcionais */}
      {typeof window !== "undefined" && window.location?.search.includes("runTests=true") && <DevTests />}
    </div>
  );
}

// ==========================
//  Testes (sanity, não intrusivos)
// ==========================
function DevTests() {
  useEffect(() => {
    const asserts = [];
    const assert = (cond, msg) => asserts.push([!!cond, msg]);

    try {
      assert(!!ReactMarkdown, "ReactMarkdown disponível");
      assert(typeof remarkGfm === "function" || typeof remarkGfm === "object", "remarkGfm disponível");
      assert(typeof remarkMath === "function" || typeof remarkMath === "object", "remarkMath disponível");
      assert(typeof rehypeKatex === "function" || typeof rehypeKatex === "object", "rehypeKatex disponível");
      assert(!!document.querySelector("canvas"), "Canvas presente");
      assert(!!document.getElementById("solution-area"), "Área de solução presente");

      const ok = asserts.every(([c]) => c);
      const report = asserts.map(([c, m]) => `${c ? "✅" : "❌"} ${m}`).join(" | ");
      console.log("[DevTests]", ok ? "OK" : "FALHAS", "->", report);
    } catch (e) {
      console.log("[DevTests] exceção:", e);
    }
  }, []);
  return null;
}

