import re

# Keywords that trigger navigation intent generally
NAVIGATE_KEYWORDS = {"go", "navigate", "take", "open", "show", "redirect"}

# ---------------------------------------------------------
# CENTRAL NAVIGATION MAP
# Add new pages here. Logic handles the rest.
# ---------------------------------------------------------
NAV_MAP = {
    "report": {
        "keywords": ["report"],
        "path": "/report"
    },
    "history": {
        "keywords": ["history"],
        "path": "/history"
    },
    "payment": {
        "keywords": ["payment"],
        "path": "/payment"
    },
    # Add more pages here:
    # "settings": {"keywords": ["settings", "config"], "path": "/settings"}
}
def is_navigation_intent(text: str) -> bool:
    """Check if the user input implies a navigation intent."""
    text_lower = text.lower().strip()
    words = set(re.sub(r'[?!.,]', '', text_lower).split())
    
    # Check general navigation words
    if words & NAVIGATE_KEYWORDS:
        return True
    
    # Check if any specific destination keywords are mentioned
    for config in NAV_MAP.values():
        if any(k in text_lower for k in config["keywords"]):
            return True
            
    return False

def get_navigation_destination(text: str) -> str:
    """Determine the destination page based on NAV_MAP."""
    text_lower = text.lower()
    
    for dest, config in NAV_MAP.items():
        if any(k in text_lower for k in config["keywords"]):
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
