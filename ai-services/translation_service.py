import re
import logging
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from indic_transliteration import sanscript
from indic_transliteration.sanscript import transliterate
from langdetect import detect, DetectorFactory
from rapidfuzz import process, fuzz

# Ensure consistent results for langdetect
DetectorFactory.seed = 0

logger = logging.getLogger(__name__)

class TranslationService:
    def __init__(self, kb_terms: list[str] = None):
        if kb_terms is None:
            kb_terms = []
            
        logger.info("Initializing Translation Service...")
        
        # 1. Load NLLB Translation Model explicitly (bypassing the pipeline bug)
        # npi_Deva is Nepali (Devanagari script), eng_Latn is English
        model_name = "facebook/nllb-200-distilled-600M"
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
        # 2. Nepglish Heuristics
        self.nepglish_indicators = {
            "xa", "cha", "garna", "garnu", "kasari", "kasto", "ho", "ta", 
            "ma", "pani", "lai", "haru", "ke", "k", "ra", "ko", "chha",
            "hajur", "kina", "kahile", "kaha", "kasko", "aayo", "gayo",
            "kohi", "chha", "chaina", "kura", "bhayo"
        }
        
        # KB terms for typo correction
        self.kb_terms = [term.lower() for term in kb_terms]

    def _is_english_word(self, word: str) -> bool:
        """Detect if a token is English (not Nepali roman)."""
        # Use word boundaries so "ma" doesn't match inside "mark"
        nepali_patterns = r'\b(aa|ai|au|bh|dh|gh|kh|ph|xa|lai|haru|chha|garne|garnu|bhane)\b'
        return not re.search(nepali_patterns, word.lower())

    def _fix_typos(self, text: str) -> str:
        """
        Fix typos in English domain terms.
        Used for ne_deva path only — ne_roman typo correction
        is handled inside transliterate_to_devanagari directly.
        """
        if not self.kb_terms:
            return text
            
        tokens = text.split()
        corrected = []
        for token in tokens:
            clean = re.sub(r'[^\w]', '', token.lower())
            # Only attempt correction on English-looking words > 3 chars
            if len(clean) > 3 and self._is_english_word(clean):
                match = process.extractOne(
                    clean, self.kb_terms, scorer=fuzz.ratio
                )
                if match and match[1] >= 60:
                    corrected.append(match[0])  # corrected term
                    if match[0] != clean:
                        logger.info(f"Typo fixed: '{clean}' → '{match[0]}'")
                else:
                    corrected.append(token)
            else:
                corrected.append(token)
        return " ".join(corrected)
        
    def _translate(self, text: str, src_lang: str, tgt_lang: str) -> str:
        """Helper to run the NLLB translation explicitly."""
        import torch
        # NLLB requires setting the src_lang on the tokenizer
        self.tokenizer.src_lang = src_lang
        inputs = self.tokenizer(
            text, 
            return_tensors="pt",
            truncation=True,
            max_length=512
        )
        # And setting the forced_bos_token_id for the target language
        forced_bos_token_id = self.tokenizer.convert_tokens_to_ids(tgt_lang)
        
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs, 
                forced_bos_token_id=forced_bos_token_id, 
                max_length=400
            )
        return self.tokenizer.batch_decode(outputs, skip_special_tokens=True)[0]

    def detect_language(self, text: str) -> str:
        """
        Returns: 'ne_deva', 'ne_roman', or 'en'
        """
        # 1. Check for Devanagari Script (Easiest & most accurate check)
        if re.search(r'[\u0900-\u097F]', text):
            return "ne_deva"

        # 2. Fallback to Nepglish Heuristics FIRST (langdetect is unreliable for short text)
        words = set(re.sub(r'[^\w\s]', '', text.lower()).split())
        
        # Exact match check first
        if len(words.intersection(self.nepglish_indicators)) > 0:
            return "ne_roman"
            
        # Fuzzy match check for typo tolerance
        for word in words:
            match = process.extractOne(word, list(self.nepglish_indicators), scorer=fuzz.ratio)
            if match and match[1] >= 65: # 65 is strict enough for transliterated words
                return "ne_roman"

        # 3. Check LangDetect for longer text
        try:
            lang_code = detect(text)
            if lang_code == "ne":
                # Even if it detects Nepali, check if it's Romanized vs Deva
                # We already checked for Deva above, so it must be Romanized
                return "ne_roman"
        except Exception:
            pass

        return "en"

    def transliterate_to_devanagari(self, text: str) -> str:
        """Converts Romanized Nepglish to Devanagari script while preserving English loanwords."""
        # Fix typos and identify which tokens are English
        tokens = text.split()
        corrected_tokens = []
        english_flags = []
        
        for token in tokens:
            clean = re.sub(r'[^\w]', '', token.lower())
            if len(clean) > 3 and self._is_english_word(clean) and self.kb_terms:
                match = process.extractOne(clean, self.kb_terms, scorer=fuzz.ratio)
                if match and match[1] >= 60:
                    corrected_tokens.append(match[0])  # corrected English term
                    english_flags.append(True)          # mark as English, skip transliteration
                    if match[0] != clean:
                        logger.info(f"Typo fixed: '{clean}' → '{match[0]}'")
                    continue
            corrected_tokens.append(token.lower())
            english_flags.append(False)

        # Transliterate only non-English tokens
        result = []
        for token, is_english in zip(corrected_tokens, english_flags):
            if is_english:
                result.append(token)  # keep as-is
            else:
                token = token.replace("xa", "cha")
                token = re.sub(r'\bk\b', 'ke', token)
                result.append(transliterate(token, sanscript.ITRANS, sanscript.DEVANAGARI))

        return " ".join(result)

    def transliterate_to_roman(self, text: str) -> str:
        """Converts Devanagari script back to Romanized Nepglish."""
        roman = transliterate(text, sanscript.DEVANAGARI, sanscript.ITRANS).lower()
        # Clean up some common ITRANS artifacts to match colloquial Nepglish
        roman = roman.replace('ch', 'chh').replace('c', 'ch')
        roman = roman.replace('aa', 'a').replace('ii', 'i').replace('uu', 'u')
        roman = roman.replace('|', '.')
        return roman

    def translate_to_english(self, text: str) -> dict:
        """
        Entry point: Takes raw user input, detects language, and standardizes to English.
        Returns the English text and the originally detected language.
        """
        lang = self.detect_language(text)
        logger.info(f"Detected Input Language: {lang}")

        english_text = text
        
        try:
            if lang == "ne_roman":
                # Convert Nepglish to Devanagari first
                deva_text = self.transliterate_to_devanagari(text)
                logger.info(f"Transliterated to: {deva_text}")
                # Translate Devanagari to English
                english_text = self._translate(deva_text, src_lang="npi_Deva", tgt_lang="eng_Latn")
                
            elif lang == "ne_deva":
                # Fix typos on the raw Devanagari text before translation
                text = self._fix_typos(text)
                english_text = self._translate(text, src_lang="npi_Deva", tgt_lang="eng_Latn")
        except Exception as e:
            logger.error(f"Translation to English failed: {e}")
            # Fallback to original text if translation fails
            english_text = text

        return {
            "english_query": english_text,
            "original_language": lang
        }

    def translate_from_english(self, english_text: str, target_lang: str) -> str:
        """
        Exit point: Takes the AI's English answer and translates it back.
        """
        if target_lang in ["ne_roman", "ne_deva"]:
            try:
                translated_text = self._translate(english_text, src_lang="eng_Latn", tgt_lang="npi_Deva")
                # In case translation model outputs some artifacts or empty string
                if translated_text.strip():
                    if target_lang == "ne_roman":
                        return self.transliterate_to_roman(translated_text)
                    return translated_text
            except Exception as e:
                logger.error(f"Translation from English failed: {e}")
                pass
        
        # Return English as-is if English was detected or translation failed
        return english_text
