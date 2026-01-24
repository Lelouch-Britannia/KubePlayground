from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass
class FileReadEntry:
    read_path: Path


class YamlFileOperator:
    """Simple YAML file reader."""

    @staticmethod
    def read(entry: FileReadEntry) -> dict[str, Any]:
        """Read YAML file and return the parsed content.

        Args:
            entry: FileReadEntry containing the path to read.

        Returns:
            Parsed YAML content as a dictionary.

        Raises:
            FileNotFoundError: If the config file does not exist.
            ValueError: If the YAML file cannot be parsed.
        """
        try:
            with Path(entry.read_path).open() as file:
                return yaml.safe_load(file)
        except FileNotFoundError:
            msg = f"Config file not found: {entry.read_path}"
            raise FileNotFoundError(msg) from None
        except yaml.YAMLError as e:
            msg = f"Error parsing YAML file: {e}"
            raise ValueError(msg) from e
