"""
Neural Semantic Virality Scorer
Leverages all-MiniLM-L6-v2 via ONNX Runtime to perform deep 384-D vector analysis on video transcripts.
Calculates:
1. Alignment with Viral High-Engagement Prototypes (neuroscience secrets, counter-intuitive rules, high-stakes debate)
2. Contrastive margin against Boring Low-Engagement Prototypes (mic checks, stream banter, monotone housekeeping)
3. Discourse Narrative Arc Cohesion (Hook -> Climax Payoff cosine trajectory)
4. Information Density & Lexical Entropy (filters out repetitive rambling)
"""

import os
import zlib
import numpy as np

# Model directory
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models', 'miniLM')
MODEL_PATH = os.path.join(MODEL_DIR, 'model.onnx')
TOKENIZER_PATH = os.path.join(MODEL_DIR, 'tokenizer.json')

_SESSION = None
_TOKENIZER = None

# ── High-Engagement Viral Anchor Prototypes ───────────────────────────────────
VIRAL_PROTOTYPES = [
    "The single most important principle you need to understand about human behavior and neuroscience.",
    "Morning sunlight within 30 to 60 minutes of waking triggers a critical cortisol spike in the brain that controls circadian rhythm, dopamine, and wakefulness.",
    "Here is the number one biggest mistake that people make every single day without realizing it.",
    "This secret psychological technique changed the way I think about discipline, motivation, and success.",
    "Stop doing this immediately if you want to protect your health, focus, and energy.",
    "A shocking revelation and data-backed discovery that completely contradicts what mainstream experts have told you for years.",
    "An intense, high-stakes debate between opposing viewpoints with powerful emotional conviction and decisive arguments.",
    "A life-changing framework and actionable advice that produces instant measurable results.",
    "What happens inside your body and mind when you push past your breaking point.",
    "The exact actionable protocol you need to optimize focus, dopamine, and productivity."
]

# ── Low-Engagement Boring Fluff Prototypes ────────────────────────────────────
BORING_PROTOTYPES = [
    "Hey guys welcome back to the channel, make sure to like, subscribe, and hit the notification bell below.",
    "Let me check the microphone and audio levels, is the stream live and can everyone in chat hear me ok?",
    "We are just hanging out, setting up the camera gear, adjusting the backpack, and getting ready.",
    "I was thinking about what we should order for lunch today while we wait for the meeting to start.",
    "Just casual small talk and filler chit chat before we get to anything important.",
    "Administrative housekeeping, schedule announcements, and sponsor brand mentions.",
    "Hair check, stream check, check check one two three testing mic.",
    "Where should we walk next, let me grab my keys and look around the room."
]

_VIRAL_EMBEDDINGS = None
_BORING_EMBEDDINGS = None


def ensure_model_files():
    if not os.path.exists(MODEL_DIR):
        os.makedirs(MODEL_DIR, exist_ok=True)
    if not os.path.exists(MODEL_PATH):
        try:
            import urllib.request
            print("Downloading MiniLM ONNX model from Hugging Face...")
            url = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx"
            urllib.request.urlretrieve(url, MODEL_PATH)
            print("MiniLM ONNX model downloaded successfully.")
        except Exception as e:
            print(f"Failed to auto-download model.onnx: {e}")

def get_inference_session():
    global _SESSION, _TOKENIZER
    ensure_model_files()
    if _SESSION is None and os.path.exists(MODEL_PATH) and os.path.exists(TOKENIZER_PATH):
        try:
            import onnxruntime as ort
            from tokenizers import Tokenizer
            
            _TOKENIZER = Tokenizer.from_file(TOKENIZER_PATH)
            _TOKENIZER.enable_truncation(max_length=256)
            _TOKENIZER.enable_padding(length=256)
            
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 2
            opts.inter_op_num_threads = 1
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            
            _SESSION = ort.InferenceSession(MODEL_PATH, sess_options=opts, providers=['CPUExecutionProvider'])
        except Exception as e:
            print(f"Failed to initialize MiniLM session: {e}")
            _SESSION = False
    return _SESSION, _TOKENIZER


def embed_texts(texts):
    """
    Computes unit-normalized 384-D dense embeddings for a list of strings.
    """
    session, tokenizer = get_inference_session()
    if not session or not tokenizer or not texts:
        return np.zeros((len(texts), 384), dtype=np.float32)

    try:
        encoded = [tokenizer.encode(t if t.strip() else "...") for t in texts]
        input_ids = np.array([e.ids for e in encoded], dtype=np.int64)
        attention_mask = np.array([e.attention_mask for e in encoded], dtype=np.int64)
        token_type_ids = np.array([e.type_ids for e in encoded], dtype=np.int64)

        inputs = {
            'input_ids': input_ids,
            'attention_mask': attention_mask,
            'token_type_ids': token_type_ids
        }

        outputs = session.run(None, inputs)
        last_hidden_state = outputs[0]  # shape: (N, seq_len, 384)

        # Masked mean pooling
        mask_expanded = np.expand_dims(attention_mask, -1).astype(np.float32)
        sum_embeddings = np.sum(last_hidden_state * mask_expanded, axis=1)
        sum_mask = np.clip(np.sum(mask_expanded, axis=1), a_min=1e-9, a_max=None)
        embeddings = sum_embeddings / sum_mask

        # Unit length normalization for cosine similarity
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms = np.clip(norms, a_min=1e-9, a_max=None)
        embeddings = embeddings / norms
        return embeddings.astype(np.float32)
    except Exception as e:
        print(f"MiniLM embedding error: {e}")
        return np.zeros((len(texts), 384), dtype=np.float32)


def get_prototype_embeddings():
    global _VIRAL_EMBEDDINGS, _BORING_EMBEDDINGS
    if _VIRAL_EMBEDDINGS is None:
        _VIRAL_EMBEDDINGS = embed_texts(VIRAL_PROTOTYPES)
    if _BORING_EMBEDDINGS is None:
        _BORING_EMBEDDINGS = embed_texts(BORING_PROTOTYPES)
    return _VIRAL_EMBEDDINGS, _BORING_EMBEDDINGS


def compute_lexical_density(text):
    """
    Computes compression ratio & lexical entropy.
    Repetitive monotone rambling compresses heavily (low entropy).
    Dense, rich, informative speech has high entropy.
    """
    if not text or len(text.strip()) < 10:
        return 0.5
    
    clean_bytes = text.lower().strip().encode('utf-8')
    compressed = zlib.compress(clean_bytes)
    ratio = len(compressed) / float(len(clean_bytes))
    
    # Vocabulary diversity
    tokens = text.lower().split()
    unique_ratio = len(set(tokens)) / float(max(1, len(tokens)))
    
    combined = 0.5 * ratio + 0.5 * unique_ratio
    return float(np.clip(combined, 0.1, 1.0))


def score_candidate_semantics(clip_text, hook_text=None, payoff_text=None, body_text=None):
    """
    Evaluates semantic quality of a clip:
    Returns dict:
      - viral_similarity: Max/mean cosine sim to viral prototypes
      - boring_similarity: Max/mean cosine sim to boring prototypes
      - semantic_margin: (viral_sim - boring_sim) mapped to [0, 1]
      - discourse_arc: Cosine similarity between hook opening and payoff closing
      - lexical_density: Information compression entropy
      - triad_cohesion: Directed progression across Hook -> Body -> Payoff vectors
    """
    viral_embs, boring_embs = get_prototype_embeddings()
    if viral_embs is None or len(viral_embs) == 0:
        return {
            'viral_similarity': 0.5,
            'boring_similarity': 0.2,
            'semantic_margin': 0.65,
            'discourse_arc': 0.5,
            'lexical_density': 0.5,
            'triad_cohesion': 0.6
        }

    # Embed clip body, hook, payoff, and intermediate body if provided
    texts_to_embed = [clip_text]
    if hook_text and payoff_text:
        texts_to_embed.extend([hook_text, payoff_text])
        if body_text:
            texts_to_embed.append(body_text)
        
    embeddings = embed_texts(texts_to_embed)
    clip_emb = embeddings[0]

    # 1. Cosine similarity against Viral Prototypes
    viral_sims = np.dot(viral_embs, clip_emb)
    max_viral = float(np.max(viral_sims))
    mean_viral = float(np.mean(viral_sims))
    viral_score = 0.7 * max_viral + 0.3 * mean_viral

    # 2. Cosine similarity against Boring Prototypes
    boring_sims = np.dot(boring_embs, clip_emb)
    max_boring = float(np.max(boring_sims))
    mean_boring = float(np.mean(boring_sims))
    boring_score = 0.7 * max_boring + 0.3 * mean_boring

    # 3. Semantic Margin (High = Viral substance, Low/Negative = Boring filler)
    raw_margin = viral_score - (1.1 * boring_score)
    semantic_margin = float(np.clip((raw_margin + 0.25) / 0.85, 0.0, 1.0))

    # 4. Discourse Narrative Arc (Hook to Payoff closure)
    if len(embeddings) >= 3:
        hook_emb = embeddings[1]
        payoff_emb = embeddings[2]
        arc_sim = float(np.dot(hook_emb, payoff_emb))
        discourse_arc = float(np.clip((arc_sim + 0.2) / 1.0, 0.0, 1.0))
    else:
        discourse_arc = 0.5

    # 5. Triad Cohesion (Hook -> Body -> Payoff thematic continuity)
    if len(embeddings) >= 4:
        hook_emb = embeddings[1]
        payoff_emb = embeddings[2]
        mid_emb = embeddings[3]
        sim_hb = float(np.dot(hook_emb, mid_emb))
        sim_bp = float(np.dot(mid_emb, payoff_emb))
        triad_cohesion = float(np.clip((0.5 * sim_hb + 0.5 * sim_bp + 0.2) / 1.0, 0.0, 1.0))
    else:
        triad_cohesion = float(np.clip(discourse_arc * 0.9 + 0.1, 0.0, 1.0))

    # 6. Lexical Density
    lexical_density = compute_lexical_density(clip_text)

    return {
        'viral_similarity': round(viral_score, 4),
        'boring_similarity': round(boring_score, 4),
        'semantic_margin': round(semantic_margin, 4),
        'discourse_arc': round(discourse_arc, 4),
        'triad_cohesion': round(triad_cohesion, 4),
        'lexical_density': round(lexical_density, 4)
    }
