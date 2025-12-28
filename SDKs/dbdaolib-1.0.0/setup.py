from setuptools import setup, find_packages

setup(
    name="dbdaolib",           # The name used for pip install
    version="1.0.0",           # The version
    packages=find_packages(),  # Automatically finds 'daolib' and subpackages
    include_package_data=True,
    
    # List the dependencies your library needs to run
    install_requires=[
        "sqlalchemy",
        "motor",
        "beanie",
        "pyyaml"
    ],
    
    author="Mayank Pershad",
    description="A unified Database Access Object library for SQL and NoSQL",
    python_requires='>=3.8',
)