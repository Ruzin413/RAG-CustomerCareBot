import re
from rapidfuzz import process, fuzz

# Keywords that trigger navigation intent generally
NAVIGATE_KEYWORDS = ["navigate", "redirect"]

# ---------------------------------------------------------
# CENTRAL NAVIGATION MAP
# Add new pages here. Logic handles the rest.
# ---------------------------------------------------------
NAV_MAP = {
    "report": {
        "keywords": ["report"],
        "path": "/report"
    }
    # Add more pages here:
    # "settings": {"keywords": ["settings", "config"], "path": "/settings"}
}

def is_navigation_intent(text: str) -> bool:
    """Check if the user input implies a navigation intent.
    Only triggers when a NAVIGATE_KEYWORD (navigate, redirect) is present."""
    text_lower = text.lower().strip()
    words = set(re.sub(r'[?!.,]', '', text_lower).split())
    
    # Navigation intent REQUIRES a navigate/redirect keyword (with fuzzy matching)
    for word in words:
        match = process.extractOne(word, NAVIGATE_KEYWORDS, scorer=fuzz.ratio)
        if match and match[1] >= 60:
            return True
            
    return False

def get_navigation_destination(text: str) -> str:
    """Determine the destination page based on NAV_MAP."""
    text_lower = text.lower()
    words = set(re.sub(r'[?!.,]', '', text_lower).split())
    
    for dest, config in NAV_MAP.items():
        for word in words:
            match = process.extractOne(word, config["keywords"], scorer=fuzz.ratio)
            if match and match[1] >= 60:
                return dest
                
    return None

def build_navigation_reply(dest: str) -> str:
    """Generate a polite reply for navigation."""
    return f"Sure! Redirecting you to the {dest} page now."

def get_redirect_path(dest: str) -> str:
    """Map internal destination names to URL paths via NAV_MAP."""
    if dest in NAV_MAP:
        return NAV_MAP[dest]["path"]
    return "/"
