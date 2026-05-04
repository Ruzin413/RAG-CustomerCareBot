import re
import logging
from transformers import pipeline
from indic_transliteration import sanscript
from indic_transliteration.sanscript import transliterate
from langdetect import detect, DetectorFactory

# Ensure consistent results for langdetect
DetectorFactory.seed = 0

logger = logging.getLogger(__name__)

class TranslationService:
    def __init__(self):
        logger.info("Initializing Translation Service...")
        
        # 1. Load Helsinki-NLP Translation Pipelines
        self.ne_to_en = pipeline("translation", model="Helsinki-NLP/opus-mt-ne-en")
        self.en_to_ne = pipeline("translation", model="Helsinki-NLP/opus-mt-en-ne")
        
        # 2. Nepglish Heuristics
        self.nepglish_indicators = {
            "xa", "cha", "garna", "garnu", "kasari", "kasto", "ho", "ta", 
            "ma", "pani", "lai", "haru", "ke", "k", "ra", "ko", "chha",
            "hajur", "kina", "kahile", "kaha", "kasko", "aayo", "gayo",
            "kohi", "chha", "chaina", "kura", "bhayo"
        }

    def detect_language(self, text: str) -> str:
        """
        Returns: 'ne_deva', 'ne_roman', or 'en'
        """
        # 1. Check for Devanagari Script (Easiest & most accurate check)
        if re.search(r'[\u0900-\u097F]', text):
            return "ne_deva"

        # 2. Check LangDetect
        try:
            lang_code = detect(text)
            if lang_code == "ne":
                # Even if it detects Nepali, check if it's Romanized vs Deva
                # We already checked for Deva above, so it must be Romanized
                return "ne_roman"
        except Exception:
            pass

        # 3. Fallback to Nepglish Heuristics
        words = set(re.sub(r'[^\w\s]', '', text.lower()).split())
        if len(words.intersection(self.nepglish_indicators)) > 0:
            return "ne_roman"

        return "en"

    def transliterate_to_devanagari(self, text: str) -> str:
        """Converts Romanized Nepglish to Devanagari script."""
        # indic-transliteration uses ITRANS. It handles "xa" / "cha" decently well.
        # Custom pre-processing replacements for common slang
        text = text.lower()
        text = text.replace("xa", "cha")
        # Ensure 'k' alone or with space becomes 'ke'
        text = re.sub(r'\bk\b', 'ke', text)
        return transliterate(text, sanscript.ITRANS, sanscript.DEVANAGARI)

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
                res = self.ne_to_en(deva_text)
                english_text = res[0]['translation_text']
                
            elif lang == "ne_deva":
                # Directly translate Devanagari to English
                res = self.ne_to_en(text)
                english_text = res[0]['translation_text']
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
                # We ALWAYS respond in Devanagari to avoid weird Nepglish generation
                res = self.en_to_ne(english_text)
                translated_text = res[0]['translation_text']
                # In case translation model outputs some artifacts or empty string
                if translated_text.strip():
                    return translated_text
            except Exception as e:
                logger.error(f"Translation from English failed: {e}")
                pass
        
        # Return English as-is if English was detected or translation failed
        return english_text
