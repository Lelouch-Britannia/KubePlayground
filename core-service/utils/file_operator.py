import yaml
from dataclasses import dataclass

@dataclass
class FileReadEntry:
    read_path: str

class YamlFileOperator:
    """Simple YAML reader to match your interface"""
    def read(self, entry: FileReadEntry):
        try:
            with open(entry.read_path, 'r') as file:
                return [yaml.safe_load(file)]
        except Exception as e:
            raise Exception(f"Failed to read YAML at {entry.read_path}: {e}")