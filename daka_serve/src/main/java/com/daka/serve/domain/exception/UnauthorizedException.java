package com.daka.serve.domain.exception;

public class UnauthorizedException extends DomainException {
    public UnauthorizedException() {
        super("登录已失效，请重新登录");
    }
}
