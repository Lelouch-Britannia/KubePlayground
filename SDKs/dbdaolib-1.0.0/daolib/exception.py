class SqlDaoException(Exception):
    def __init__(self, err_code: int, msg: str):
        self.err_code: int = err_code
        self.msg: str = msg

    def __str__(self):
        return f"{__name__}: {self.err_code} - {self.msg}"
