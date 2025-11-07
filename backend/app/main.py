# backend/app/main.py

from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional, Tuple
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from fastapi.middleware.cors import CORSMiddleware
import re, difflib, logging

# ---------- optional spaCy NER ----------
try:
    import spacy
    NER = spacy.load("en_core_web_sm")
except Exception:
    NER = None

app = FastAPI(title="AI Study Assistant - Simplifier", version="4.2")

# ---------- CORS ----------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger("uvicorn.error")

# ---------- Model (FLAN-T5) ----------
MODEL_NAME = "google/flan-t5-small"
_tokenizer: Optional[AutoTokenizer] = None
_model: Optional[AutoModelForSeq2SeqLM] = None

def get_model() -> Tuple[AutoTokenizer, AutoModelForSeq2SeqLM]:
    global _tokenizer, _model
    if _tokenizer is None or _model is None:
        logger.info(f"Loading model: {MODEL_NAME} ...")
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        _model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)
        _tokenizer.model_max_length = 512
        logger.info("Model loaded.")
    return _tokenizer, _model

# ---------- Schemas ----------
class SimplifyRequest(BaseModel):
    text: str = Field(..., min_length=5)
    grade: int = Field(..., ge=1, le=3)
    max_new_tokens: int = 220

class SimplifyResponse(BaseModel):
    simplified: str
    grade: int
    checks: Dict[str, Any]

# ---------- Utils ----------
SENT_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
NUM_RE = re.compile(r"[-+]?\d*\.?\d+([/%])?")
STOPWORDS = set("""
a an the and or but so because while when which that this those these in on at by to for from of into as with
is are was were be being been do does did doing have has had having it its they them he she we you i our your their
""".split())

def too_similar(a: str, b: str, thresh: float = 0.80) -> bool:  # stricter
    return difflib.SequenceMatcher(None, a, b).ratio() >= thresh

def extract_numbers(text: str) -> List[str]:
    return [m.group(0) for m in NUM_RE.finditer(text)]

def extract_entities(text: str) -> List[str]:
    if not NER:
        candidates = re.findall(r"\b([A-Z][a-zA-Z0-9\-]+(?:\s[A-Z][a-zA-Z0-9\-]+)*)\b", text)
        blacklist = {"I","The","A","An","In","On","At","For","By","To","And","But","Or"}
        return [c for c in candidates if c not in blacklist]
    doc = NER(text)
    ents = [ent.text for ent in doc.ents if ent.label_ in {
        "PERSON","ORG","GPE","NORP","FAC","LOC","PRODUCT","EVENT","WORK_OF_ART","LAW","LANGUAGE"}]
    seen, out = set(), []
    for e in ents:
        if e not in seen:
            out.append(e); seen.add(e)
    return out

def core_content_words(text: str, limit: int = 6) -> List[str]:
    words = [w.strip(".,;:!?()[]\"'").lower() for w in text.split()]
    words = [w for w in words if w and w not in STOPWORDS and not NUM_RE.fullmatch(w) and len(w) >= 5]
    uniq = []
    for w in words:
        if w not in uniq:
            uniq.append(w)
    return uniq[:limit]

def looks_instructional(text: str) -> bool:
    patterns = [
        r"^\s*(instruction|instructions|instructing)\s*:?",
        r"^\s*(use|using)\s+(very\s+)?(short|simple|easy)\s+(words|sentences)\b",
        r"\b(simplify|grade\s*\d)\b.*\b(use|using)\b",
        r"^\s*simplified\s*:?",
        r"^\s*a paraphrase\b",
        r"^\s*quote from\b",
    ]
    rex = re.compile("|".join(patterns), re.IGNORECASE)
    for s in re.split(r"(?<=[.!?])\s+", text.strip()):
        if rex.search(s):
            return True
    return False

def post_fix_fragments(text: str) -> str:
    text = re.sub(r"\.\s+(make|do|see|learn|build|create|use|help|show)\b", r" and \1", text, flags=re.IGNORECASE)
    text = re.sub(r"\.\s+and\b", r" and", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+\.", ".", text)
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text

# ---------- Phrase/word simplification rules ----------
PHRASES = [
    (r"\bdata packets\b", "small pieces of data"),
    (r"\bacross the globe\b", "around the world"),
    (r"\bgreenhouse gases\b", "gases that keep heat"),
    (r"\bultraviolet radiation\b", "UV rays"),
    (r"\bto enable\b", "so that"),
    (r"\bwith minimal human intervention\b", "with little help from people"),
    (r"\brecognize patterns\b", "find common patterns"),
]
G1_WORDS = {
    "algorithms": "step-by-step rules",
    "algorithm": "step-by-step rule",
    "intervention": "help",
    "approximately": "about",
    "utilize": "use",
    "protocols": "rules for sending data",
    "organisms": "living things",
    "organism": "living thing",
    "emitted": "given off",
    "accumulation": "build-up",
    "glucose": "sugar",
    "radiation": "rays",
}
G2_WORDS = {
    "algorithms": "step-by-step rules",
    "intervention": "help",
    "approximately": "about",
    "utilize": "use",
    "protocols": "rules for sending data",
    "organisms": "living things",
    "emitted": "given off",
    "accumulation": "build-up",
    "glucose": "sugar",
}
G3_WORDS = {
    "utilize": "use",
    "approximately": "about",
}

def apply_rules(text: str, grade: int) -> str:
    out = text
    for pat, rep in PHRASES:
        out = re.sub(pat, rep, out, flags=re.IGNORECASE)
    mapping = G1_WORDS if grade == 1 else G2_WORDS if grade == 2 else G3_WORDS
    for k, v in mapping.items():
        out = re.sub(rf"\b{re.escape(k)}\b", v, out, flags=re.IGNORECASE)
    # small structure fixes
    out = re.sub(r"\bso that computers can\b", "so computers can", out, flags=re.IGNORECASE)
    out = re.sub(r"\s{2,}", " ", out)
    return out.strip()

# ---------- Prompting ----------
FEW_SHOT = (
    "Original: Excess carbon dioxide traps heat in the atmosphere, increasing global temperatures.\n"
    "Rewrite for Grade 1: Too much carbon dioxide keeps heat in the air. This warms the Earth.\n\n"
    "Original: A battery stores chemical energy and turns it into electrical energy when used.\n"
    "Rewrite for Grade 2: A battery stores energy in chemicals. When you use it, it gives electrical energy.\n\n"
    "Original: Vaccines train the immune system to recognize and fight specific pathogens.\n"
    "Rewrite for Grade 3: Vaccines teach your immune system to spot certain germs and fight them.\n\n"
)

def build_prompt(text: str, grade: int, must_include: Optional[List[str]] = None) -> str:
    guide = {
        1: "Rewrite for Grade 1 with very simple words and clear sentences. Do not copy the original wording.",
        2: "Rewrite for Grade 2 with simple words and clear sentences. Do not copy the original wording.",
        3: "Rewrite for Grade 3 with clear, simple language and a little more detail. Do not copy the original wording.",
    }[grade]
    inc = ""
    if must_include:
        inc = " Make sure to include: " + ", ".join(f'"{t}"' for t in must_include) + "."
    return (
        f"{FEW_SHOT}"
        f"{guide} Keep every fact, number, and name.{inc}\n\n"
        f"Original: {text.strip()}\n"
        f"Rewritten:"
    )

def _encode(prompt: str, tok: AutoTokenizer, max_len: int = 512):
    enc = tok(prompt, return_tensors="pt", truncation=True, max_length=max_len)
    if enc.input_ids.shape[-1] > max_len:
        enc = {k: v[:, -max_len:] for k, v in enc.items()}
    return enc

def gen_once(prompt: str, max_new: int, sample: bool) -> str:
    tok, mdl = get_model()
    enc = _encode(prompt, tok, 512)
    out = mdl.generate(
        **enc,
        do_sample=sample,
        temperature=0.9 if sample else None,
        top_p=0.92 if sample else None,
        num_beams=1 if sample else 6,
        max_new_tokens=max_new,
        no_repeat_ngram_size=3,
        early_stopping=True,
        length_penalty=0.7 if not sample else 1.0,
        repetition_penalty=1.07,
    )
    return tok.decode(out[0], skip_special_tokens=True).strip()

def try_model_once(text: str, grade: int, max_new: int, must_include: Optional[List[str]] = None) -> str:
    prompt = build_prompt(text, grade, must_include)
    out = gen_once(prompt, max_new, sample=False)
    if looks_instructional(out) or not out or too_similar(text, out):
        out = gen_once(prompt, max_new, sample=True)
    return post_fix_fragments(out)

def important_tokens(original: str) -> List[str]:
    tokens: List[str] = []
    ents = extract_entities(original)
    nums = extract_numbers(original)
    cores = core_content_words(original, limit=6)
    for t in ents + nums + cores:
        if t and t not in tokens:
            tokens.append(t)
    return tokens[:10]

def missing_required(original: str, simplified: str) -> List[str]:
    req = important_tokens(original)
    missing: List[str] = []
    sim_low = simplified.lower()
    for t in req:
        if t.isnumeric():
            if t not in simplified:
                missing.append(t)
        else:
            if t.lower() not in sim_low:
                missing.append(t)
    return missing

# ---------- Checks ----------
def build_checks(original: str, simplified: str) -> Dict[str, Any]:
    orig_nums = extract_numbers(original)
    simp_nums = extract_numbers(simplified)
    orig_ents = extract_entities(original)
    simp_ents = extract_entities(simplified)
    return {
        "original_numbers": orig_nums,
        "simplified_numbers": simp_nums,
        "missing_numbers": [n for n in orig_nums if n not in simp_nums],
        "original_entities": orig_ents,
        "simplified_entities": simp_ents,
        "missing_entities": [e for e in orig_ents if e not in simp_ents],
        "used_spacy": bool(NER),
    }

# ---------- Forced rewrite pipeline if model copies ----------
def forced_rewrite(original: str, grade: int) -> str:
    # 1) apply strong phrase/word rules
    txt = apply_rules(original, grade)

    # 2) restructure some connectors for clarity
    # commas + which/that → small sentences joined with "This ..."
    txt = re.sub(r",\s*(which|that)\s+", ". This ", txt, flags=re.IGNORECASE)
    # "and make/and do" after a period → join with "and"
    txt = re.sub(r"\.\s+and\s+", " and ", txt, flags=re.IGNORECASE)

    # 3) small grammar tidy
    txt = re.sub(r"\s+\.", ".", txt)
    txt = re.sub(r"\s{2,}", " ", txt).strip()
    return txt

# ---------- Main simplifier ----------
def simplify_text(original: str, grade: int, max_new: int) -> str:
    # 1) model attempt
    out = try_model_once(original, grade, max_new)

    # 2) ensure key tokens included
    for _ in range(2):
        miss = missing_required(original, out)
        if not miss:
            break
        out = try_model_once(original, grade, max_new, must_include=miss[:6])

    # 3) if still too similar to input → forced rewrite (rules path)
    if too_similar(original, out):
        out = forced_rewrite(original, grade)

    # 4) final polish
    out = post_fix_fragments(out)
    return out

# ---------- API ----------
class Health(BaseModel):
    ok: bool
    model_loaded: bool

@app.get("/health", response_model=Health)
def health():
    return Health(ok=True, model_loaded=(_model is not None))

@app.post("/warmup")
def warmup():
    get_model()
    return {"warmed": True}

@app.post("/simplify", response_model=SimplifyResponse)
def simplify(req: SimplifyRequest):
    simplified = simplify_text(req.text, req.grade, req.max_new_tokens)
    checks = build_checks(req.text, simplified)
    return SimplifyResponse(simplified=simplified, grade=req.grade, checks=checks)
