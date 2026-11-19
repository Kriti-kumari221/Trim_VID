import os
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

KB_DIR = Path(__file__).resolve().parent / "knowledge_base"

def load_knowledge_base_chunks() -> List[Dict[str, str]]:
    """Loads and chunks knowledge base markdown documents."""
    chunks = []
    if not KB_DIR.is_dir():
        return chunks
        
    for md_file in KB_DIR.glob("*.md"):
        try:
            content = md_file.read_text(encoding="utf-8")
            sections = content.split("## ")
            for sec in sections:
                sec_text = sec.strip()
                if not sec_text:
                    continue
                header = sec_text.splitlines()[0].replace("#", "").strip()
                chunks.append({
                    "title": header,
                    "text": sec_text,
                    "source": md_file.name
                })
        except Exception as e:
            logger.warning(f"Error reading KB file {md_file}: {e}")
    return chunks

def retrieve_relevant_guidelines(query_or_transcript: str, max_chunks: int = 3) -> str:
    """
    RAG semantic keyword scoring to retrieve matching editorial principles and philosophical frameworks.
    """
    chunks = load_knowledge_base_chunks()
    if not chunks:
        return ""
        
    text_lower = query_or_transcript.lower()
    
    # Priority keywords from Acharya Prashant framework
    keywords = [
        "ego", "suffering", "sufferer", "horizontal", "vertical", "vidya", "avidya",
        "education", "seeing", "intent", "price", "maya", "desire", "freedom",
        "change", "mirror", "delusion", "dharma", "love", "compassion", "mercy", "truth"
    ]
    
    scored_chunks = []
    for c in chunks:
        score = 0
        c_text = c["text"].lower()
        for kw in keywords:
            if kw in text_lower and kw in c_text:
                score += 3
        # Match words in query
        for word in text_lower.split()[:50]:
            if len(word) > 4 and word in c_text:
                score += 1
        scored_chunks.append((score, c))
        
    scored_chunks.sort(key=lambda x: x[0], reverse=True)
    top_chunks = [c["text"] for score, c in scored_chunks[:max_chunks] if score > 0]
    
    if not top_chunks and chunks:
        top_chunks = [chunks[0]["text"]]
        
    return "\n\n---\n\n".join(top_chunks)
