package com.daka.serve.domain.exception;

public class AccountAlreadyExistsException extends DomainException {
    public AccountAlreadyExistsException() {
        super("该账号已存在");
    }
}
