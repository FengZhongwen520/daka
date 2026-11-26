package com.daka.serve.domain.exception;

public class InvalidCredentialsException extends DomainException {
    public InvalidCredentialsException() {
        super("账号或密码错误");
    }
}
