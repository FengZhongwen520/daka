package com.daka.serve.infrastructure.mail;

import com.daka.serve.domain.exception.ValidationException;
import com.daka.serve.domain.model.VerificationPurpose;
import com.daka.serve.domain.service.MailSender;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class SmtpMailSender implements MailSender {
    private final ObjectProvider<JavaMailSender> mailSenderProvider;
    private final String smtpHost;
    private final String from;

    public SmtpMailSender(
        ObjectProvider<JavaMailSender> mailSenderProvider,
        @Value("${spring.mail.host:}") String smtpHost,
        @Value("${daka.mail.from:}") String from
    ) {
        this.mailSenderProvider = mailSenderProvider;
        this.smtpHost = smtpHost;
        this.from = from;
    }

    @Override
    public boolean isConfigured() {
        return StringUtils.hasText(smtpHost) && StringUtils.hasText(from);
    }

    @Override
    public void sendVerificationCode(
        String email,
        VerificationPurpose purpose,
        String code,
        long expiresInSeconds
    ) {
        if (!isConfigured()) {
            throw new ValidationException("邮箱服务尚未配置，请联系管理员");
        }
        String action = purpose == VerificationPurpose.BIND_EMAIL
            ? "绑定邮箱"
            : "重置密码";
        long minutes = Math.max(1, expiresInSeconds / 60);

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject("页巢 " + action + "验证码");
        message.setText(
            "你的页巢验证码是：" + code + "\n\n"
                + "验证码 " + minutes + " 分钟内有效，仅可使用一次。\n"
                + "如果不是你本人操作，请忽略这封邮件。"
        );
        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (mailSender == null) {
            throw new ValidationException("邮箱服务尚未配置，请联系管理员");
        }
        mailSender.send(message);
    }
}
