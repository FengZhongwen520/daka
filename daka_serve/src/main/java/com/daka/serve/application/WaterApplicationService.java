package com.daka.serve.application;

import com.daka.serve.domain.exception.ValidationException;
import com.daka.serve.domain.model.WaterRecord;
import com.daka.serve.domain.repository.WaterRecordRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

@Service
public class WaterApplicationService {
    private final WaterRecordRepository records;

    public WaterApplicationService(WaterRecordRepository records) {
        this.records = records;
    }

    @Transactional(readOnly = true)
    public WaterView get(UUID ownerId, long widgetId, LocalDate date) {
        validate(widgetId, date);
        return records.find(ownerId, widgetId, date)
            .map(record -> view(record, Instant.now()))
            .orElseGet(() -> new WaterView(widgetId, date, 0, null, null));
    }

    @Transactional
    public WaterView drink(UUID ownerId, long widgetId, LocalDate date, int amountMl) {
        validate(widgetId, date);
        if (amountMl < 1 || amountMl > 2_000) {
            throw new ValidationException("单次饮水量需为 1-2000 ml");
        }
        Instant now = Instant.now();
        WaterRecord current = records.find(ownerId, widgetId, date).orElse(null);
        WaterRecord updated = records.save(new WaterRecord(
            current == null ? UUID.randomUUID() : current.id(),
            ownerId,
            widgetId,
            date,
            (current == null ? 0 : current.totalMl()) + amountMl,
            now,
            now
        ));
        return view(updated, now);
    }

    @Transactional(readOnly = true)
    public List<WaterView> history(
        UUID ownerId,
        long widgetId,
        LocalDate from,
        LocalDate to
    ) {
        if (from.isAfter(to)) throw new ValidationException("历史开始日期不能晚于结束日期");
        if (ChronoUnit.DAYS.between(from, to) > 366) {
            throw new ValidationException("单次最多查询 366 天");
        }
        Instant now = Instant.now();
        return records.findRange(ownerId, widgetId, from, to).stream()
            .map(record -> view(record, now))
            .toList();
    }

    private WaterView view(WaterRecord record, Instant now) {
        Long idleMinutes = record.lastDrinkAt() == null
            ? null
            : Math.max(0, Duration.between(record.lastDrinkAt(), now).toMinutes());
        return new WaterView(
            record.widgetId(),
            record.date(),
            record.totalMl(),
            record.lastDrinkAt(),
            idleMinutes
        );
    }

    private void validate(long widgetId, LocalDate date) {
        if (widgetId <= 0) throw new ValidationException("组件 ID 无效");
        if (date == null) throw new ValidationException("日期不能为空");
    }

    public record WaterView(
        long widgetId,
        LocalDate date,
        int totalMl,
        Instant lastDrinkAt,
        Long idleMinutes
    ) {
    }
}
