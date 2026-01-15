from typing import Any, Dict
import yaml
from pathlib import Path
from dataclasses import dataclass

@dataclass
class FileReadEntry:
    read_path: Path
        
class YamlFileOperator:
    """Simple YAML file reader"""
    
    @staticmethod
    def read(entry: FileReadEntry) -> Dict[str, Any]:
        """Read YAML file and return the parsed content"""
        try:
            with open(entry.read_path, 'r') as file:
                return yaml.safe_load(file)
        except FileNotFoundError:
            raise FileNotFoundError(f"Config file not found: {entry.read_path}")
        except yaml.YAMLError as e:
            raise ValueError(f"Error parsing YAML file: {e}")