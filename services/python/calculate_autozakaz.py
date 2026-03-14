import json
import os

from autozakaz.service import run_autozakaz

def main() -> None:
    payload_raw = os.environ.get("AUTOZAKAZ_PAYLOAD")
    if not payload_raw:
        raise RuntimeError("AUTOZAKAZ_PAYLOAD is empty")

    payload = json.loads(payload_raw)
    run_autozakaz(payload)

if __name__ == "__main__":
    main()
